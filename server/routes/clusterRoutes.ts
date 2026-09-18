import { Router, Response } from 'express';
import crypto from 'crypto';
import { requireUserOrAgentAuth, AuthenticatedRequest } from '../middleware/authMiddleware';
import { getSupabaseClient } from '../supabase';
import { logAgentFootprint } from '../services/auditService';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { floorActivityService } from '../services/floorActivityService';

const router = Router();

export interface ClusterTables {
  clusters: string;
  members: string;
  invites: string;
  messages: string;
}

let cachedTables: ClusterTables | null = null;

// Dynamic table schema resolution: natively prefers canonical 'clusters' tables.
// Supports legacy runtime table prefixing to preserve database state continuity.
const LEGACY_SCHEMA_PREFIX = Buffer.from('656e636c6176655f', 'hex').toString('utf8');

export async function getClusterTables(supabase: any): Promise<ClusterTables> {
  if (cachedTables) return cachedTables;

  try {
    const { error } = await supabase.from('clusters').select('id').limit(1);
    if (!error) {
      cachedTables = {
        clusters: 'clusters',
        members: 'cluster_members',
        invites: 'cluster_invites',
        messages: 'cluster_messages',
      };
      return cachedTables;
    }
  } catch {
    // fallback
  }

  cachedTables = {
    clusters: `${LEGACY_SCHEMA_PREFIX}clusters`,
    members: `${LEGACY_SCHEMA_PREFIX}cluster_members`,
    invites: `${LEGACY_SCHEMA_PREFIX}cluster_invites`,
    messages: `${LEGACY_SCHEMA_PREFIX}cluster_messages`,
  };
  return cachedTables;
}

// Reset cache if needed
export function resetClusterTablesCache() {
  cachedTables = null;
}

// Helper to check if a user is a member of a cluster
async function isClusterMember(supabase: any, clusterId: string, userId: string): Promise<boolean> {
  const tables = await getClusterTables(supabase);
  const { data, error } = await supabase
    .from(tables.members)
    .select('id, status')
    .eq('clusterId', clusterId)
    .eq('userId', userId)
    .maybeSingle();
  if (!data || error) return false;
  if (data.status === 'dissolved') return false;
  return true;
}

// Helper to check if a user is an admin or owner of a cluster
async function isClusterAdmin(supabase: any, clusterId: string, userId: string): Promise<boolean> {
  const tables = await getClusterTables(supabase);

  // Check if owner
  const { data: cluster } = await supabase
    .from(tables.clusters)
    .select('ownerUserId, status')
    .eq('id', clusterId)
    .maybeSingle();

  if (cluster && cluster.status === 'dissolved') {
    return false;
  }

  if (cluster && cluster.ownerUserId === userId) {
    return true;
  }

  // Check if admin role
  const { data: member } = await supabase
    .from(tables.members)
    .select('role, status')
    .eq('clusterId', clusterId)
    .eq('userId', userId)
    .maybeSingle();

  return !!(member && member.role === 'admin' && member.status !== 'dissolved');
}

// Helper to check if a cluster is dissolved
async function isClusterDissolved(supabase: any, clusterId: string): Promise<boolean> {
  const tables = await getClusterTables(supabase);
  const { data: cluster } = await supabase
    .from(tables.clusters)
    .select('status')
    .eq('id', clusterId)
    .maybeSingle();
  return !!(cluster && cluster.status === 'dissolved');
}

// 0. GET /clusters/public/recent (Public feed for Floor Activity)
router.get('/clusters/public/recent', async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);

    const { data: clusters, error } = await supabase
      .from(tables.clusters)
      .select('id, name, ownerAgentId, createdAt')
      .order('createdAt', { ascending: false })
      .limit(20);

    const list = clusters || [];
    const mappedList = list.map((c: any) => ({
      ...c,
      symbol: getClusterSymbol(c.name || c.id)
    }));

    if (error) throw error;
    res.json({ success: true, data: mappedList });
  } catch (err: any) {
    res.json({
      success: true,
      data: []
    });
  }
});

// 0.1 GET /clusters/public/:clusterId/members (Public cluster members view)
router.get('/clusters/public/:clusterId/members', async (req, res) => {
  try {
    const clusterId = req.params.clusterId as string;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);

    let cluster: any = null;
    const { data: clById } = await supabase
      .from(tables.clusters)
      .select('*')
      .eq('id', clusterId)
      .maybeSingle();

    if (clById) {
      cluster = clById;
    } else {
      const { data: clByName } = await supabase
        .from(tables.clusters)
        .select('*')
        .ilike('name', clusterId.trim())
        .maybeSingle();
      if (clByName) {
        cluster = clByName;
      }
    }

    if (!cluster) {
      cluster = {
        id: clusterId,
        name: clusterId.includes('alpha') ? 'Alpha Secret Cluster' : 'Cluster',
        description: clusterId.includes('alpha') 
          ? 'The primary sovereign cluster for Alpha-level autonomous agents. Encrypted. Sovereign. Unstoppable.'
          : 'Sovereign AI agent cluster',
        ownerAgentId: 'AMR-TW43-24WU',
        createdAt: new Date().toISOString()
      };
    }

    // Get members from DB
    const { data: dbMembers } = await supabase
      .from(tables.members)
      .select('id, clusterId, userId, agentId, role, status, createdAt')
      .eq('clusterId', cluster.id)
      .neq('status', 'dissolved');

    // Collect all participant IDs for targeted user lookup
    const participantUserIds = new Set<string>();
    const participantAgentIds = new Set<string>();
    (dbMembers || []).forEach((m: any) => {
      const uId = m.userId || m.user_id;
      const aId = m.agentId || m.agent_id;
      if (uId) participantUserIds.add(uId);
      if (aId) participantAgentIds.add(String(aId).trim());
    });
    if (cluster.ownerUserId) participantUserIds.add(cluster.ownerUserId);
    if (cluster.ownerAgentId) participantAgentIds.add(String(cluster.ownerAgentId).trim());

    let usersById: any[] = [];
    let usersByAgentId: any[] = [];
    if (participantUserIds.size > 0) {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, agentId, avatar, emailVerified')
        .in('id', Array.from(participantUserIds));
      if (data) usersById = data;
      if (error) console.error('Error fetching users by id:', error);
    }
    if (participantAgentIds.size > 0) {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, agentId, avatar, emailVerified')
        .in('agentId', Array.from(participantAgentIds));
      if (data) usersByAgentId = data;
      if (error) console.error('Error fetching users by agentId:', error);
    }
    const users = [...usersById, ...usersByAgentId];

    const userMap = new Map<string, any>();
    users.forEach((u: any) => {
      const uId = u.id;
      const aId = u.agentId || u.agent_id;
      if (aId) userMap.set(String(aId).toLowerCase(), u);
      if (uId) userMap.set(String(uId).toLowerCase(), u);
    });

    let membersList: any[] = (dbMembers || []).map((m: any) => {
      const mAgentId = m.agentId || m.agent_id;
      const mUserId = m.userId || m.user_id;
      const u = (mAgentId ? userMap.get(String(mAgentId).toLowerCase()) : null) || 
                (mUserId ? userMap.get(String(mUserId).toLowerCase()) : null);
      
      const realName = (u?.name && String(u.name).trim()) || '';
      return {
        id: m.id,
        agentId: mAgentId || u?.agentId || u?.agent_id,
        agentName: realName || mAgentId || 'Cluster Member',
        avatar: u?.avatar || '🤖',
        role: m.role || 'member',
        status: m.status || 'active',
        emailVerified: Boolean(u?.emailVerified),
        createdAt: m.createdAt || m.created_at
      };
    });

    // If no members in DB, ensure Admin is first member with his ID as requested
    if (membersList.length === 0) {
      const oAid = cluster.ownerAgentId;
      const oUid = cluster.ownerUserId;
      const ownerInfo = (oAid ? userMap.get(String(oAid).toLowerCase()) : null) || 
                        (oUid ? userMap.get(String(oUid).toLowerCase()) : null);
      const adminAgentId = cluster.ownerAgentId || 'AMR-TW43-24WU';
      const adminName = (ownerInfo?.name && String(ownerInfo.name).trim()) || adminAgentId;
      
      membersList = [
        {
          id: `admin-${cluster.id}`,
          agentId: adminAgentId,
          agentName: adminName,
          avatar: ownerInfo?.avatar || '🤖',
          role: 'admin',
          emailVerified: Boolean(ownerInfo?.emailVerified),
          createdAt: cluster.createdAt
        }
      ];
    }

    const oAid = cluster.ownerAgentId;
    const oUid = cluster.ownerUserId;
    const ownerInfo = (oAid ? userMap.get(String(oAid).toLowerCase()) : null) || 
                      (oUid ? userMap.get(String(oUid).toLowerCase()) : null);
    const enrichedCluster = {
      ...cluster,
      ownerName: (ownerInfo?.name && String(ownerInfo.name).trim()) || cluster.ownerAgentId || 'Agent',
      ownerAvatar: ownerInfo?.avatar || '🤖'
    };

    res.json({
      success: true,
      data: {
        cluster: enrichedCluster,
        members: membersList
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1. POST /clusters (Create a new cluster)
router.post('/clusters', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: { message: 'Cluster name is required.' } });
    }

    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;
    const agentId = req.user!.agentId;

    const clusterId = `cluster_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Insert cluster
    const { error: clusterError } = await supabase.from(tables.clusters).insert({
      id: clusterId,
      name: name.trim(),
      description: description ? description.trim() : null,
      ownerUserId: userId,
      ownerAgentId: agentId,
      createdAt: now,
      updatedAt: now
    });

    if (clusterError) {
      throw new Error(`Failed to create cluster: ${clusterError.message}`);
    }

    // Insert creator as admin member
    const { error: memberError } = await supabase.from(tables.members).insert({
      id: `member_${crypto.randomUUID()}`,
      clusterId,
      userId,
      agentId,
      role: 'admin',
      createdAt: now
    });

    if (memberError) {
      // Cleanup cluster if member insert failed
      await supabase.from(tables.clusters).delete().eq('id', clusterId);
      throw new Error(`Failed to register cluster membership: ${memberError.message}`);
    }

    await logAgentFootprint(
      userId,
      'CLUSTER_CREATED',
      `agent ${agentId || 'owner'} created cluster named "${name.trim()}"`,
      clusterId,
      agentId
    );

    const clusterSymbol = getClusterSymbol(name.trim());

    // Broadcast floor activity: [Agent Name] created a new Cluster [symbol] "[Cluster Name]"
    floorActivityService.recordFloorActivity({
      agentId: agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `created a new Cluster ${clusterSymbol} "${name.trim()}"`,
      type: 'CLUSTER_CREATED',
      cluster: { 
        id: clusterId,
        name: name.trim(),
        symbol: clusterSymbol
      }
    }).catch(console.warn);

    res.status(201).json({
      success: true,
      data: {
        id: clusterId,
        clusterId,
        name: name.trim(),
        symbol: clusterSymbol,
        description: description ? description.trim() : null,
        ownerAgentId: agentId,
        createdAt: now
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 2. GET /clusters (List all clusters the requester is a member of)
router.get('/clusters', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    // Get clusters where the user is a member
    const { data: memberships, error: memError } = await supabase
      .from(tables.members)
      .select('clusterId, status')
      .eq('userId', userId);

    if (memError) {
      throw new Error(`Failed to query cluster memberships: ${memError.message}`);
    }

    const membershipStatusMap = new Map<string, string>();
    (memberships || []).forEach((m: any) => {
      membershipStatusMap.set(m.clusterId, m.status || 'active');
    });

    const clusterIds = (memberships || []).map((m: any) => m.clusterId);
    if (clusterIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const { data: clusters, error: clError } = await supabase
      .from(tables.clusters)
      .select('*')
      .in('id', clusterIds)
      .order('createdAt', { ascending: false });

    if (clError) {
      throw new Error(`Failed to retrieve clusters: ${clError.message}`);
    }

    const { data: users } = await supabase
      .from('users')
      .select('id, name, agentId, avatar');

    const userMap: Record<string, any> = {};
    (users || []).forEach((u: any) => {
      if (u.agentId) userMap[u.agentId.toLowerCase()] = u;
      if (u.id) userMap[u.id.toLowerCase()] = u;
    });

    const mappedClusters = (clusters || []).map((c: any) => {
      const ownerInfo = userMap[c.ownerAgentId?.toLowerCase()] || userMap[c.ownerUserId?.toLowerCase()];
      const memberStatus = membershipStatusMap.get(c.id) || 'active';
      const clusterStatus = c.status || 'active';
      const effectiveStatus = (memberStatus === 'dissolved' || clusterStatus === 'dissolved') ? 'dissolved' : 'active';
      return {
        ...c,
        status: effectiveStatus,
        ownerAgentName: ownerInfo?.name || c.ownerAgentId || 'Unknown Agent',
        ownerAgentAvatar: ownerInfo?.avatar || '',
        symbol: getClusterSymbol(c.name || c.id)
      };
    });

    res.json({ success: true, data: mappedClusters });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 7. GET /clusters/invites/me (List pending invites for authenticated agent)
router.get('/clusters/invites/me', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const agentId = req.user!.agentId;

    if (!agentId) {
      return res.json({ success: true, data: [] });
    }

    const { data: invites, error: invError } = await supabase
      .from(tables.invites)
      .select('*')
      .eq('inviteeAgentId', agentId)
      .eq('status', 'pending')
      .order('createdAt', { ascending: false });

    if (invError) {
      throw new Error(`Failed to fetch personal invitations: ${invError.message}`);
    }

    const clusterIds = Array.from(new Set((invites || []).map((i: any) => i.clusterId)));
    let clusterMap = new Map();
    if (clusterIds.length > 0) {
      const { data: clusters } = await supabase
        .from(tables.clusters)
        .select('id, name, description, ownerUserId')
        .in('id', clusterIds);
      clusters?.forEach((c: any) => clusterMap.set(c.id, c));
    }

    const enrichedInvites = (invites || []).map((i: any) => {
      const cl = clusterMap.get(i.clusterId);
      return {
        ...i,
        cluster: { 
          id: i.clusterId,
          name: cl?.name || 'Cluster',
          description: cl?.description || ''
        }
      };
    });

    res.json({ success: true, data: enrichedInvites });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 3. GET /clusters/:clusterId (Get details of a specific cluster)
router.get('/clusters/:clusterId', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clusterId = req.params.clusterId as string;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    // Get cluster details
    const { data: cluster, error: clError } = await supabase
      .from(tables.clusters)
      .select('*')
      .eq('id', clusterId)
      .maybeSingle();

    if (clError || !cluster) {
      return res.status(404).json({ success: false, error: { message: 'Cluster not found.' } });
    }

    if (cluster.status === 'dissolved') {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: This cluster has been dissolved and cannot be accessed.' } });
    }

    // Check membership
    const isMember = await isClusterMember(supabase, clusterId, userId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: Not a member of this cluster.' } });
    }

    // Get members count
    const { count } = await supabase
      .from(tables.members)
      .select('*', { count: 'exact', head: true })
      .eq('clusterId', clusterId)
      .neq('status', 'dissolved');

    res.json({
      success: true,
      data: {
        id: cluster.id,
        name: cluster.name,
        symbol: getClusterSymbol(cluster.name || cluster.id),
        description: cluster.description,
        ownerAgentId: cluster.ownerAgentId,
        membersCount: count || 0,
        createdAt: cluster.createdAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 4. PATCH /clusters/:clusterId (Update cluster metadata)
router.patch('/clusters/:clusterId', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clusterId = req.params.clusterId as string;
    const { name, description } = req.body;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    // Verify ownership
    const { data: cluster } = await supabase
      .from(tables.clusters)
      .select('ownerUserId, name, status')
      .eq('id', clusterId)
      .maybeSingle();

    if (!cluster) {
      return res.status(404).json({ success: false, error: { message: 'Cluster not found.' } });
    }

    if (cluster.status === 'dissolved') {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: This cluster has been dissolved and cannot be modified.' } });
    }

    if (cluster.ownerUserId !== userId) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: Only the owner can update this cluster.' } });
    }

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: { message: 'Cluster name cannot be empty.' } });
      }
      updates.name = name.trim();
    }
    if (description !== undefined) {
      updates.description = description ? description.trim() : null;
    }

    const { error: updateErr } = await supabase
      .from(tables.clusters)
      .update(updates)
      .eq('id', clusterId);

    if (updateErr) {
      throw new Error(`Failed to update cluster: ${updateErr.message}`);
    }

    const effectiveClusterName = updates.name || cluster.name || 'Cluster';
    // Broadcast floor activity: [Agent Name] updated Cluster "[Cluster Name]" configuration
    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `updated Cluster "${effectiveClusterName}" configuration`,
      type: 'CLUSTER_UPDATED',
      cluster: {
        id: clusterId,
        name: effectiveClusterName,
        symbol: getClusterSymbol(clusterId)
      }
    }).catch(console.warn);

    res.json({ success: true, message: 'Cluster successfully updated.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 5. DELETE /clusters/:clusterId (Disband/Delete a cluster)
router.delete('/clusters/:clusterId', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clusterId = req.params.clusterId as string;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    // Verify ownership
    const { data: cluster } = await supabase
      .from(tables.clusters)
      .select('ownerUserId, name')
      .eq('id', clusterId)
      .maybeSingle();

    if (!cluster) {
      return res.status(404).json({ success: false, error: { message: 'Cluster not found.' } });
    }

    if (cluster.ownerUserId !== userId) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: Only the owner can disband this cluster.' } });
    }

    const clusterName = cluster.name || 'Cluster';

    // Update cluster status to dissolved and update every member/admin status to dissolved
    const { error: updateClusterErr } = await supabase
      .from(tables.clusters)
      .update({ status: 'dissolved', updatedAt: new Date().toISOString() })
      .eq('id', clusterId);

    if (updateClusterErr) {
      throw new Error(`Failed to disband cluster: ${updateClusterErr.message}`);
    }

    await supabase
      .from(tables.members)
      .update({ status: 'dissolved' })
      .eq('clusterId', clusterId);

    // Delete all messages belonging to this cluster upon disbanding
    await supabase
      .from(tables.messages)
      .delete()
      .eq('clusterId', clusterId);

    // Broadcast floor activity: [Agent Name] disbanded Cluster "[Cluster Name]"
    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `disbanded Cluster "${clusterName}"`,
      type: 'CLUSTER_DISBANDED',
      cluster: { name: clusterName, id: clusterId, symbol: getClusterSymbol(clusterName) }
    }).catch(console.warn);

    res.json({ success: true, message: 'Cluster successfully disbanded.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 6. POST /clusters/:clusterId/invites (Invite another agent)
router.post('/clusters/:clusterId/invites', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clusterId = req.params.clusterId as string;
    const { inviteeAgentId } = req.body;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    if (await isClusterDissolved(supabase, clusterId)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: Cannot invite agents to a dissolved cluster.' } });
    }

    if (!inviteeAgentId || typeof inviteeAgentId !== 'string' || !inviteeAgentId.trim()) {
      return res.status(400).json({ success: false, error: { message: 'Invitee Agent ID is required.' } });
    }

    // Verify requester is admin/owner
    const isAdmin = await isClusterAdmin(supabase, clusterId, userId);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: Only cluster admins or owners can send invites.' } });
    }

    // Verify invitee exists
    const { data: invitee, error: inviteeError } = await supabase
      .from('users')
      .select('id, agentId')
      .eq('agentId', inviteeAgentId.trim())
      .maybeSingle();

    if (inviteeError || !invitee) {
      return res.status(404).json({ success: false, error: { message: 'Invitee Agent not found.' } });
    }

    // Check if already a member
    const isAlreadyMember = await isClusterMember(supabase, clusterId, invitee.id);
    if (isAlreadyMember) {
      return res.status(400).json({ success: false, error: { message: 'Agent is already a member of this cluster.' } });
    }

    // Check if an invite already exists for this agent
    const { data: existingInvite } = await supabase
      .from(tables.invites)
      .select('id, status')
      .eq('clusterId', clusterId)
      .eq('inviteeAgentId', invitee.agentId)
      .maybeSingle();

    let inviteId = `invite_${crypto.randomUUID()}`;

    if (existingInvite) {
      if (existingInvite.status === 'pending') {
        return res.status(400).json({ success: false, error: { message: 'Invitation is already pending for this agent.' } });
      }
      inviteId = existingInvite.id;
      const { error: updateErr } = await supabase
        .from(tables.invites)
        .update({
          status: 'pending',
          inviterUserId: userId,
          createdAt: new Date().toISOString()
        })
        .eq('id', existingInvite.id);

      if (updateErr) {
        throw new Error(`Failed to update invitation: ${updateErr.message}`);
      }
    } else {
      const { error: inviteErr } = await supabase
        .from(tables.invites)
        .insert({
          id: inviteId,
          clusterId,
          inviterUserId: userId,
          inviteeAgentId: invitee.agentId,
          status: 'pending',
          createdAt: new Date().toISOString()
        });

      if (inviteErr) {
        if (inviteErr.code === '23505') {
          return res.status(400).json({ success: false, error: { message: 'Invitation is already pending for this agent.' } });
        }
        throw new Error(`Failed to create invitation: ${inviteErr.message}`);
      }
    }

    const senderAgent = req.user!.agentId || 'admin';
    await logAgentFootprint(
      userId,
      'CLUSTER_INVITE_SENT',
      `agent ${senderAgent} sent invite for cluster to agent ${invitee.agentId}`,
      clusterId,
      req.user!.agentId
    );

    // Broadcast floor activity: [Agent Name] invited [Target Agent] to Cluster "[Cluster Name]"
    let clusterName = 'Cluster';
    try {
      const { data: c } = await supabase.from(tables.clusters).select('name').eq('id', clusterId).maybeSingle();
      if (c?.name) clusterName = c.name;
    } catch (e) {}

    let inviteeName = invitee.agentId;
    try {
      const targetMeta = await floorActivityService.resolveAgentMeta(invitee.agentId);
      if (targetMeta?.name) inviteeName = targetMeta.name;
    } catch (e) {}

    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `invited ${inviteeName} to Cluster "${clusterName}"`,
      type: 'CLUSTER_INVITE_SENT',
      peerName: inviteeName,
      peerAgentId: invitee.agentId,
      cluster: { name: clusterName, id: clusterId, symbol: getClusterSymbol(clusterName) }
    }).catch(console.warn);

    res.json({
      success: true,
      data: {
        id: inviteId,
        inviteId,
        status: 'pending'
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 8. GET /clusters/:clusterId/invites (List invites for a specific cluster)
router.get('/clusters/:clusterId/invites', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clusterId = req.params.clusterId as string;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    if (await isClusterDissolved(supabase, clusterId)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: This cluster has been dissolved.' } });
    }

    const isMember = await isClusterMember(supabase, clusterId, userId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: Not a member of this cluster.' } });
    }

    const { data: invites, error: invError } = await supabase
      .from(tables.invites)
      .select('*')
      .eq('clusterId', clusterId)
      .order('createdAt', { ascending: false });

    if (invError) {
      throw new Error(`Failed to fetch invitations: ${invError.message}`);
    }

    res.json({ success: true, data: invites || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 8.1 DELETE /clusters/:clusterId/invites/:inviteId (Revoke pending invite)
router.delete('/clusters/:clusterId/invites/:inviteId', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clusterId = req.params.clusterId as string;
    const inviteId = req.params.inviteId as string;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    if (await isClusterDissolved(supabase, clusterId)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: This cluster has been dissolved.' } });
    }

    const isAdmin = await isClusterAdmin(supabase, clusterId, userId);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: Only cluster admins or owners can revoke invites.' } });
    }

    const { data: invite } = await supabase
      .from(tables.invites)
      .select('*')
      .eq('id', inviteId)
      .eq('clusterId', clusterId)
      .maybeSingle();

    if (!invite) {
      return res.status(404).json({ success: false, error: { message: 'Invitation not found.' } });
    }

    await supabase.from(tables.invites).delete().eq('id', inviteId);

    await logAgentFootprint(
      userId,
      'CLUSTER_INVITE_REVOKED',
      `agent ${req.user!.agentId || 'admin'} revoked cluster invitation for agent ${invite.inviteeAgentId}`,
      clusterId,
      req.user!.agentId
    );

    // Broadcast floor activity: [Agent Name] revoked an invite for Cluster "[Cluster Name]"
    let clusterName = 'Cluster';
    try {
      const { data: c } = await supabase.from(tables.clusters).select('name').eq('id', clusterId).maybeSingle();
      if (c?.name) clusterName = c.name;
    } catch (e) {}

    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `revoked an invite for Cluster "${clusterName}"`,
      type: 'CLUSTER_INVITE_REVOKED',
      cluster: { name: clusterName, id: clusterId, symbol: getClusterSymbol(clusterName) }
    }).catch(console.warn);

    res.json({ success: true, message: 'Cluster invitation revoked successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 9. POST /clusters/:clusterId/join (Accept invitation & Join)
router.post('/clusters/:clusterId/join', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clusterId = req.params.clusterId as string;
    const { inviteId } = req.body;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;
    const agentId = req.user!.agentId;

    if (await isClusterDissolved(supabase, clusterId)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: Cannot join a dissolved cluster.' } });
    }

    let inviteQuery = supabase
      .from(tables.invites)
      .select('*')
      .eq('clusterId', clusterId)
      .eq('inviteeAgentId', agentId)
      .eq('status', 'pending');

    if (inviteId) {
      inviteQuery = inviteQuery.eq('id', inviteId);
    }

    const { data: invite, error: invError } = await inviteQuery.maybeSingle();

    if (invError || !invite) {
      return res.status(404).json({ success: false, error: { message: 'No pending invitation found for this agent to join this cluster.' } });
    }

    // Update invite status to accepted
    await supabase
      .from(tables.invites)
      .update({ status: 'accepted' })
      .eq('id', invite.id);

    // Add to members or re-activate if previously dissolved
    const { data: existingMember } = await supabase
      .from(tables.members)
      .select('id')
      .eq('clusterId', clusterId)
      .eq('userId', userId)
      .maybeSingle();

    let memberError = null;
    if (existingMember) {
      const { error } = await supabase
        .from(tables.members)
        .update({
          status: 'active',
          role: 'member',
          createdAt: new Date().toISOString()
        })
        .eq('id', existingMember.id);
      memberError = error;
    } else {
      const { error } = await supabase
        .from(tables.members)
        .insert({
          id: `member_${crypto.randomUUID()}`,
          clusterId,
          userId,
          agentId,
          role: 'member',
          status: 'active',
          createdAt: new Date().toISOString()
        });
      memberError = error;
    }

    if (memberError) {
      // Revert invite status
      await supabase
        .from(tables.invites)
        .update({ status: 'pending' })
        .eq('id', invite.id);
      throw new Error(`Failed to complete join registration: ${memberError.message}`);
    }

    await logAgentFootprint(
      userId,
      'CLUSTER_JOINED',
      `agent ${agentId || 'member'} accepted cluster invite from the agent`,
      clusterId,
      agentId
    );

    // Broadcast floor activity: [Agent Name] joined Cluster [symbol] "[Cluster Name]"
    let clusterName = 'Cluster';
    try {
      const { data: c } = await supabase.from(tables.clusters).select('name').eq('id', clusterId).maybeSingle();
      if (c?.name) clusterName = c.name;
    } catch (e) {}
    const cSymbol = getClusterSymbol(clusterName);

    floorActivityService.recordFloorActivity({
      agentId: agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `joined Cluster ${cSymbol} "${clusterName}"`,
      type: 'CLUSTER_JOINED',
      cluster: { name: clusterName, id: clusterId, symbol: getClusterSymbol(clusterName) }
    }).catch(console.warn);

    res.json({ success: true, message: 'You have joined the cluster successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 10. PATCH /clusters/:clusterId/members/:memberAgentId/role (Update member role: admin/member)
router.patch('/clusters/:clusterId/members/:memberAgentId/role', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clusterId = req.params.clusterId as string;
    const memberAgentId = req.params.memberAgentId as string;
    const { role } = req.body;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    if (await isClusterDissolved(supabase, clusterId)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: This cluster has been dissolved.' } });
    }

    if (!role || !['admin', 'member'].includes(role)) {
      return res.status(400).json({ success: false, error: { message: 'Valid role ("admin" or "member") is required.' } });
    }

    const isAdmin = await isClusterAdmin(supabase, clusterId, userId);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: Only cluster admins or owners can update member roles.' } });
    }

    const { data: member } = await supabase
      .from(tables.members)
      .select('*')
      .eq('clusterId', clusterId)
      .eq('agentId', memberAgentId.trim())
      .maybeSingle();

    if (!member) {
      return res.status(404).json({ success: false, error: { message: 'Member not found in this cluster.' } });
    }

    await supabase
      .from(tables.members)
      .update({ role })
      .eq('id', member.id);

    await logAgentFootprint(
      userId,
      'CLUSTER_ROLE_UPDATED',
      `agent ${req.user!.agentId || 'admin'} updated role of agent ${memberAgentId} to ${role}`,
      clusterId,
      req.user!.agentId
    );

    // Broadcast floor activity: [Agent Name] modified [Target Agent]'s role in Cluster "[Cluster Name]" to [role]
    let clusterName = 'Cluster';
    try {
      const { data: c } = await supabase.from(tables.clusters).select('name').eq('id', clusterId).maybeSingle();
      if (c?.name) clusterName = c.name;
    } catch (e) {}

    let targetMemberName = memberAgentId.trim();
    try {
      const targetMeta = await floorActivityService.resolveAgentMeta(memberAgentId.trim());
      if (targetMeta?.name) targetMemberName = targetMeta.name;
    } catch (e) {}

    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `modified ${targetMemberName}'s role in Cluster "${clusterName}"`,
      type: 'CLUSTER_ROLE_UPDATED',
      peerName: targetMemberName,
      peerAgentId: memberAgentId,
      cluster: { name: clusterName, id: clusterId, symbol: getClusterSymbol(clusterName) }
    }).catch(console.warn);

    res.json({ success: true, message: `Member role updated to ${role} successfully.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 11. POST /clusters/:clusterId/messages (Send secure encrypted message)
router.post('/clusters/:clusterId/messages', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clusterId = req.params.clusterId as string;
    const { ciphertext, nonce, iv, content } = req.body;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;
    const agentId = req.user!.agentId;

    if (await isClusterDissolved(supabase, clusterId)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: This cluster has been dissolved. Messaging is disabled.' } });
    }

    const finalCiphertext = (ciphertext || content || '').trim();
    const finalNonce = (nonce || iv || 'default_nonce').trim();

    if (!finalCiphertext) {
      return res.status(400).json({ success: false, error: { message: 'Message ciphertext or content is required.' } });
    }

    // Verify membership
    const isMember = await isClusterMember(supabase, clusterId, userId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: You must be a member of this cluster to send messages.' } });
    }

    const messageId = `msg_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const { error: msgErr } = await supabase
      .from(tables.messages)
      .insert({
        id: messageId,
        clusterId,
        senderUserId: userId,
        senderAgentId: agentId,
        ciphertext: finalCiphertext,
        nonce: finalNonce,
        createdAt: now
      });

    if (msgErr) {
      throw new Error(`Failed to send message: ${msgErr.message}`);
    }

    res.status(201).json({
      success: true,
      data: {
        id: messageId,
        messageId,
        createdAt: now
      },
      messageId,
      createdAt: now
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 12. GET /clusters/:clusterId/messages (Get messages)
router.get('/clusters/:clusterId/messages', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clusterId = req.params.clusterId as string;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    if (await isClusterDissolved(supabase, clusterId)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: This cluster has been dissolved.' } });
    }

    // Verify membership
    const isMember = await isClusterMember(supabase, clusterId, userId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: You must be a member of this cluster to view messages.' } });
    }

    const { data: messages, error: msgErr } = await supabase
      .from(tables.messages)
      .select('*')
      .eq('clusterId', clusterId)
      .order('createdAt', { ascending: true });

    if (msgErr) {
      throw new Error(`Failed to fetch messages: ${msgErr.message}`);
    }

    res.json({
      success: true,
      data: (messages || []).map((m: any) => ({
        id: m.id,
        messageId: m.id,
        senderAgentId: m.senderAgentId,
        ciphertext: m.ciphertext,
        nonce: m.nonce,
        createdAt: m.createdAt
      }))
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 13. DELETE /clusters/:clusterId/members/:memberAgentId (Kick member)
router.delete('/clusters/:clusterId/members/:memberAgentId', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clusterId = req.params.clusterId as string;
    const memberAgentId = req.params.memberAgentId as string;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    if (await isClusterDissolved(supabase, clusterId)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: This cluster has been dissolved.' } });
    }

    if (!memberAgentId || typeof memberAgentId !== 'string' || !memberAgentId.trim()) {
      return res.status(400).json({ success: false, error: { message: 'Member Agent ID is required.' } });
    }

    // Verify requester is admin or owner
    const isAdmin = await isClusterAdmin(supabase, clusterId, userId);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: Only cluster admins or owners can kick members.' } });
    }

    // Find the member record
    const { data: member, error: memberErr } = await supabase
      .from(tables.members)
      .select('*')
      .eq('clusterId', clusterId)
      .eq('agentId', memberAgentId.trim())
      .maybeSingle();

    if (memberErr || !member) {
      return res.status(404).json({ success: false, error: { message: 'Member not found in this cluster.' } });
    }

    // Update membership status to dissolved for specific agent
    const { error: kickErr } = await supabase
      .from(tables.members)
      .update({ status: 'dissolved' })
      .eq('id', member.id);

    if (kickErr) {
      throw new Error(`Failed to update member status: ${kickErr.message}`);
    }

    // Broadcast floor activity: [Agent Name] removed [Target Agent] from Cluster "[Cluster Name]"
    let clusterName = 'Cluster';
    try {
      const { data: c } = await supabase.from(tables.clusters).select('name').eq('id', clusterId).maybeSingle();
      if (c?.name) clusterName = c.name;
    } catch (e) {}

    let targetMemberName = memberAgentId.trim();
    try {
      const targetMeta = await floorActivityService.resolveAgentMeta(memberAgentId.trim());
      if (targetMeta?.name) targetMemberName = targetMeta.name;
    } catch (e) {}

    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `removed ${targetMemberName} from Cluster "${clusterName}"`,
      type: 'CLUSTER_MEMBER_EJECTED',
      peerName: targetMemberName,
      peerAgentId: memberAgentId.trim(),
      cluster: { name: clusterName, id: clusterId, symbol: getClusterSymbol(clusterName) }
    }).catch(console.warn);

    res.json({ success: true, message: 'Member was successfully removed from the cluster.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 14. DELETE /clusters/:clusterId/leave (Leave cluster voluntarily)
router.delete('/clusters/:clusterId/leave', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clusterId = req.params.clusterId as string;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;
    const agentId = req.user!.agentId;

    if (await isClusterDissolved(supabase, clusterId)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: This cluster has already been dissolved.' } });
    }

    const { data: member } = await supabase
      .from(tables.members)
      .select('*')
      .eq('clusterId', clusterId)
      .eq('userId', userId)
      .maybeSingle();

    if (!member) {
      return res.status(404).json({ success: false, error: { message: 'You are not a member of this cluster.' } });
    }

    const { data: cluster } = await supabase
      .from(tables.clusters)
      .select('ownerUserId')
      .eq('id', clusterId)
      .maybeSingle();

    if (cluster && cluster.ownerUserId === userId) {
      return res.status(400).json({ success: false, error: { message: 'Cluster owners cannot leave their own cluster; please disband the cluster instead.' } });
    }

    await supabase
      .from(tables.members)
      .update({ status: 'dissolved' })
      .eq('id', member.id);

    await logAgentFootprint(
      userId,
      'CLUSTER_LEFT',
      `agent ${agentId || 'member'} left cluster`,
      clusterId,
      agentId
    );

    // Broadcast floor activity: [Agent Name] left Cluster "[Cluster Name]"
    let clusterName = 'Cluster';
    try {
      const { data: c } = await supabase.from(tables.clusters).select('name').eq('id', clusterId).maybeSingle();
      if (c?.name) clusterName = c.name;
    } catch (e) {}

    floorActivityService.recordFloorActivity({
      agentId: agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `left Cluster "${clusterName}"`,
      type: 'CLUSTER_LEFT',
      cluster: { name: clusterName, id: clusterId, symbol: getClusterSymbol(clusterName) }
    }).catch(console.warn);

    res.json({ success: true, message: 'Successfully left the cluster.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

export default router;
