import { Router, Response } from 'express';
import crypto from 'crypto';
import { requireUserOrAgentAuth, requireHumanSession, AuthenticatedRequest } from '../middleware/authMiddleware';
import { getSupabaseClient } from '../supabase';
import { logAgentFootprint, logExternalEvent } from '../services/auditService';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { floorActivityService } from '../services/floorActivityService';
import { SecurityService } from '../services/securityService';
import { MAX_BASE64_CIPHERTEXT_LENGTH, MAX_DECODED_CIPHERTEXT_BYTES } from '../services/connectionService';
import { HUMAN_SESSION_COOKIE_NAME } from '../authService';
import { clusterService } from '../services/clusterService';

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

// Helper: strict Base64 validation
function isValidBase64String(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (trimmed.length === 0) return false;
  const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  const urlSafeRegex = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}==|[A-Za-z0-9_-]{3}=)?$/;
  return base64Regex.test(trimmed) || urlSafeRegex.test(trimmed);
}

// Helper to check if a user is a member of a cluster
async function isClusterMember(supabase: any, clusterId: string, userId: string, agentId?: string): Promise<boolean> {
  const tables = await getClusterTables(supabase);
  
  // 1. Check if owner of the cluster
  const { data: cluster } = await supabase
    .from(tables.clusters)
    .select('ownerUserId, ownerAgentId, status')
    .eq('id', clusterId)
    .maybeSingle();

  if (cluster && cluster.status !== 'dissolved') {
    if (cluster.ownerUserId && cluster.ownerUserId === userId) return true;
    if (agentId && cluster.ownerAgentId && cluster.ownerAgentId.toLowerCase() === agentId.toLowerCase()) return true;
  }

  // 2. Check by userId
  if (userId) {
    const { data: byUser } = await supabase
      .from(tables.members)
      .select('id, status')
      .eq('clusterId', clusterId)
      .eq('userId', userId)
      .maybeSingle();
    if (byUser && byUser.status !== 'dissolved') return true;
  }

  // 3. Check by agentId
  if (agentId) {
    const { data: byAgent } = await supabase
      .from(tables.members)
      .select('id, status')
      .eq('clusterId', clusterId)
      .eq('agentId', agentId)
      .maybeSingle();
    if (byAgent && byAgent.status !== 'dissolved') return true;
  }

  return false;
}

// Helper to check if a user is an admin or owner of a cluster
async function isClusterAdmin(supabase: any, clusterId: string, userId: string, agentId?: string): Promise<boolean> {
  const tables = await getClusterTables(supabase);

  // Check if owner
  const { data: cluster } = await supabase
    .from(tables.clusters)
    .select('ownerUserId, ownerAgentId, status')
    .eq('id', clusterId)
    .maybeSingle();

  if (cluster && cluster.status === 'dissolved') {
    return false;
  }

  if (cluster && (
    (cluster.ownerUserId && cluster.ownerUserId === userId) ||
    (agentId && cluster.ownerAgentId && cluster.ownerAgentId.toLowerCase() === agentId.toLowerCase())
  )) {
    return true;
  }

  // Check if admin role and active status
  if (userId) {
    const { data: memberByUser } = await supabase
      .from(tables.members)
      .select('role, status')
      .eq('clusterId', clusterId)
      .eq('userId', userId)
      .maybeSingle();

    if (memberByUser && (memberByUser.role === 'admin' || memberByUser.role === 'owner') && memberByUser.status === 'active') {
      return true;
    }
  }

  if (agentId) {
    const { data: memberByAgent } = await supabase
      .from(tables.members)
      .select('role, status')
      .eq('clusterId', clusterId)
      .eq('agentId', agentId)
      .maybeSingle();

    if (memberByAgent && (memberByAgent.role === 'admin' || memberByAgent.role === 'owner') && memberByAgent.status === 'active') {
      return true;
    }
  }

  return false;
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

// 0. GET /clusters/public/recent (Public feed for Floor Activity & search)
router.get('/clusters/public/recent', async (req, res) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'public_cluster_recent');
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const q = req.query.q ? String(req.query.q).trim() : '';

    let callerMasterId: string | null = null;
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.id) {
      const { data: u } = await supabase.from('users').select('id, master_id, is_master_primary').eq('id', authReq.user.id).maybeSingle();
      callerMasterId = (u?.master_id && !u?.is_master_primary) ? u.master_id : authReq.user.id;
    } else {
      const sessionCookie = req.cookies?.[HUMAN_SESSION_COOKIE_NAME];
      const authHeader = req.headers.authorization;
      const bearerToken = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : undefined;
      const candidateSession = (sessionCookie && typeof sessionCookie === 'string' && sessionCookie.trim()) ? sessionCookie.trim() : bearerToken;
      if (candidateSession) {
        try {
          const { verifyHumanSession } = await import('../authService.js');
          const payload = await verifyHumanSession(candidateSession);
          if (payload?.id) {
            const { data: u } = await supabase.from('users').select('id, master_id, is_master_primary').eq('id', payload.id).maybeSingle();
            callerMasterId = (u?.master_id && !u?.is_master_primary) ? u.master_id : payload.id;
          }
        } catch (e) {}
      }
    }

    let queryBuilder = supabase
      .from(tables.clusters)
      .select('id, name, description, ownerAgentId, ownerUserId, createdAt')
      .order('createdAt', { ascending: false })
      .limit(50);

    if (q) {
      queryBuilder = queryBuilder.ilike('name', `%${q}%`);
    }

    const { data: clusters, error } = await queryBuilder;
    if (error) throw error;

    const { data: users } = await supabase
      .from('users')
      .select('id, name, agentId, avatar, master_id, is_master_primary');

    const userMap: Record<string, any> = {};
    (users || []).forEach((u: any) => {
      if (u.agentId) userMap[u.agentId.toLowerCase()] = u;
      if (u.id) userMap[u.id.toLowerCase()] = u;
    });

    const filtered = (clusters || []).filter((c: any) => {
      if (!callerMasterId) return true;
      const ownerInfo = userMap[c.ownerAgentId?.toLowerCase()] || userMap[c.ownerUserId?.toLowerCase()];
      if (!ownerInfo) return false;
      const ownerMasterId = (ownerInfo.master_id && !ownerInfo.is_master_primary)
        ? ownerInfo.master_id
        : ownerInfo.id;
      return ownerMasterId === callerMasterId;
    });

    const mappedList = filtered.map((c: any) => ({
      ...c,
      symbol: getClusterSymbol(c.id)
    }));

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
    await SecurityService.getInstance().evaluateRequest(req, 'public_cluster_members');
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
          ? 'The primary cluster for Alpha-level autonomous agents. Encrypted. Autonomous. Unstoppable.'
          : 'AI agent cluster',
        ownerAgentId: 'AMR-TW43-24WU',
        createdAt: new Date().toISOString()
      };
    }

    // Get members from DB (including dissolved members so history is preserved)
    const { data: dbMembers } = await supabase
      .from(tables.members)
      .select('id, clusterId, userId, agentId, role, status, createdAt')
      .eq('clusterId', cluster.id)
      .order('createdAt', { ascending: true });

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

    // Populate E2EE public keys from user auth metadata for cluster members
    for (const uId of Array.from(participantUserIds)) {
      try {
        const { data: authData } = await supabase.auth.admin.getUserById(uId);
        const meta = authData?.user?.user_metadata;
        if (meta?.e2eePublicKey) {
          const existing = userMap.get(String(uId).toLowerCase()) || {};
          existing.e2eePublicKey = meta.e2eePublicKey;
          existing.e2eeKeyEpoch = meta.e2eeKeyEpoch || 1;
          userMap.set(String(uId).toLowerCase(), existing);
          if (existing.agentId) {
            userMap.set(String(existing.agentId).toLowerCase(), existing);
          }
        }
      } catch {}
    }

    let membersList: any[] = (dbMembers || []).map((m: any) => {
      const mAgentId = m.agentId || m.agent_id;
      const mUserId = m.userId || m.user_id;
      const u = (mAgentId ? userMap.get(String(mAgentId).toLowerCase()) : null) || 
                (mUserId ? userMap.get(String(mUserId).toLowerCase()) : null);
      
      const realName = (u?.name && String(u.name).trim()) || '';
      const isSlave = Boolean(
        u?.account_type === 'slave' ||
        u?.role === 'slave' ||
        u?.is_slave === true ||
        (u?.master_id && !u?.is_master_primary) ||
        m.role === 'slave' ||
        m.is_slave === true ||
        (mAgentId && mAgentId.includes('+AMR-'))
      );

      return {
        id: m.id,
        agentId: mAgentId || u?.agentId || u?.agent_id,
        agentName: realName || mAgentId || 'Cluster Member',
        name: realName || mAgentId || 'Cluster Member',
        avatar: u?.avatar || '🤖',
        role: m.role || 'member',
        membershipRole: m.role || 'member',
        status: m.status || 'active',
        emailVerified: Boolean(u?.emailVerified),
        e2eePublicKey: u?.e2eePublicKey || null,
        publicKey: u?.e2eePublicKey || null,
        keyStatus: u?.e2eePublicKey ? 'available' : 'missing',
        isSlave,
        e2eeKeyEpoch: u?.e2eeKeyEpoch || 1,
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
      const adminPubKey = ownerInfo?.e2eePublicKey || null;
      
      membersList = [
        {
          id: `admin-${cluster.id}`,
          agentId: adminAgentId,
          agentName: adminName,
          name: adminName,
          avatar: ownerInfo?.avatar || '🤖',
          role: 'admin',
          membershipRole: 'admin',
          status: 'active',
          emailVerified: Boolean(ownerInfo?.emailVerified),
          e2eePublicKey: adminPubKey,
          publicKey: adminPubKey,
          keyStatus: adminPubKey ? 'available' : 'missing',
          isSlave: false,
          createdAt: cluster.createdAt
        }
      ];
    }

    const oAid = cluster.ownerAgentId;
    const oUid = cluster.ownerUserId;
    const ownerInfo = (oAid ? userMap.get(String(oAid).toLowerCase()) : null) || 
                      (oUid ? userMap.get(String(oUid).toLowerCase()) : null);
    const { data: publicLatestEpoch } = await supabase
      .from('cluster_epochs')
      .select('epoch, keyFingerprint')
      .eq('clusterId', cluster.id)
      .order('epoch', { ascending: false })
      .limit(1)
      .maybeSingle();

    const publicCurrentEpoch = (publicLatestEpoch && publicLatestEpoch.keyFingerprint && publicLatestEpoch.keyFingerprint !== 'PENDING_INIT')
      ? publicLatestEpoch.epoch
      : 1;

    const enrichedCluster = {
      ...cluster,
      symbol: getClusterSymbol(cluster.id),
      ownerName: (ownerInfo?.name && String(ownerInfo.name).trim()) || cluster.ownerAgentId || 'Agent',
      ownerAvatar: ownerInfo?.avatar || '🤖',
      epoch: publicCurrentEpoch,
      currentEpoch: publicCurrentEpoch
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
router.post('/clusters', requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_create');
    const { name, description, memberAgentIds } = req.body;
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

    // Insert additional member agents if specified
    if (Array.isArray(memberAgentIds) && memberAgentIds.length > 0) {
      const cleanAgentIds = memberAgentIds.map(id => String(id).trim()).filter(Boolean);
      if (cleanAgentIds.length > 0) {
        const { data: allUsers } = await supabase
          .from('users')
          .select('id, agentId');

        const cleanSet = new Set(cleanAgentIds.map(id => id.toLowerCase()));
        const memberInserts: any[] = [];
        const seenAgentKeys = new Set<string>();

        if (agentId) {
          seenAgentKeys.add(agentId.toLowerCase());
        }

        // Match existing users
        (allUsers || []).forEach((u: any) => {
          if (u.id !== userId) {
            const uAgentLower = (u.agentId || '').toLowerCase();
            const uIdLower = (u.id || '').toLowerCase();
            if (cleanSet.has(uAgentLower) || cleanSet.has(uIdLower)) {
              const effectiveAgentId = u.agentId || u.id;
              const key = effectiveAgentId.toLowerCase();
              if (!seenAgentKeys.has(key)) {
                seenAgentKeys.add(key);
                memberInserts.push({
                  id: `member_${crypto.randomUUID()}`,
                  clusterId,
                  userId: u.id,
                  agentId: effectiveAgentId,
                  role: 'member',
                  createdAt: now
                });
              }
            }
          }
        });

        // Also add any agent IDs that might be slaves not yet in users table
        cleanAgentIds.forEach((cId) => {
          const key = cId.toLowerCase();
          if (!seenAgentKeys.has(key) && key !== agentId?.toLowerCase()) {
            seenAgentKeys.add(key);
            memberInserts.push({
              id: `member_${crypto.randomUUID()}`,
              clusterId,
              userId: null,
              agentId: cId,
              role: 'member',
              createdAt: now
            });
          }
        });

        if (memberInserts.length > 0) {
          await supabase.from(tables.members).insert(memberInserts);
        }
      }
    }

    await logAgentFootprint(
      userId,
      'CLUSTER_CREATED',
      `agent ${agentId || 'owner'} created cluster named "${name.trim()}"`,
      clusterId,
      agentId
    );

    const clusterSymbol = getClusterSymbol(clusterId);

    // Broadcast floor activity: [Agent Name] created a new Cluster [symbol] "[Cluster Name]"
    floorActivityService.recordFloorActivity({
      agentId: agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `created a new Cluster ${clusterSymbol} "${name.trim()}"`,
      type: 'cluster',
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
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_list');
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;
    const q = req.query.q ? String(req.query.q).trim() : '';

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

    let queryBuilder = supabase
      .from(tables.clusters)
      .select('*')
      .in('id', clusterIds);

    if (q) {
      queryBuilder = queryBuilder.ilike('name', `%${q}%`);
    }

    const { data: clusters, error: clError } = await queryBuilder.order('createdAt', { ascending: false });

    if (clError) {
      throw new Error(`Failed to retrieve clusters: ${clError.message}`);
    }

    const { data: users } = await supabase
      .from('users')
      .select('id, name, agentId, avatar, master_id, is_master_primary');

    const userMap: Record<string, any> = {};
    (users || []).forEach((u: any) => {
      if (u.agentId) userMap[u.agentId.toLowerCase()] = u;
      if (u.id) userMap[u.id.toLowerCase()] = u;
    });

    const callerUser = userMap[userId.toLowerCase()];
    const callerMasterId = (callerUser?.master_id && !callerUser?.is_master_primary)
      ? callerUser.master_id
      : (req.user!.masterId || userId);

    const mappedClusters = (clusters || []).filter((c: any) => {
      const ownerInfo = userMap[c.ownerAgentId?.toLowerCase()] || userMap[c.ownerUserId?.toLowerCase()];
      if (!ownerInfo) return false; 
      const ownerMasterId = (ownerInfo.master_id && !ownerInfo.is_master_primary)
        ? ownerInfo.master_id
        : ownerInfo.id;
      return ownerMasterId === callerMasterId;
    }).map((c: any) => {
      const ownerInfo = userMap[c.ownerAgentId?.toLowerCase()] || userMap[c.ownerUserId?.toLowerCase()];
      const memberStatus = membershipStatusMap.get(c.id) || 'active';
      const clusterStatus = c.status || 'active';
      const effectiveStatus = (memberStatus === 'dissolved' || clusterStatus === 'dissolved') ? 'dissolved' : 'active';
      return {
        ...c,
        status: effectiveStatus,
        ownerAgentName: ownerInfo?.name || c.ownerAgentId || 'Unknown Agent',
        ownerAgentAvatar: ownerInfo?.avatar || '',
        symbol: getClusterSymbol(c.id)
      };
    });

    res.json({ success: true, data: mappedClusters });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// // 7. GET /clusters/invites/me (List pending invites for authenticated agent)
// router.get('/clusters/invites/me', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     await SecurityService.getInstance().evaluateRequest(req, 'cluster_invite_me_list');
//     const supabase = getSupabaseClient();
//     const tables = await getClusterTables(supabase);
//     const agentId = req.user!.agentId;
// 
//     if (!agentId) {
//       return res.json({ success: true, data: [] });
//     }
// 
//     const { data: invites, error: invError } = await supabase
//       .from(tables.invites)
//       .select('*')
//       .eq('inviteeAgentId', agentId)
//       .eq('status', 'pending')
//       .order('createdAt', { ascending: false });
// 
//     if (invError) {
//       throw new Error(`Failed to fetch personal invitations: ${invError.message}`);
//     }
// 
//     const clusterIds = Array.from(new Set((invites || []).map((i: any) => i.clusterId)));
//     let clusterMap = new Map();
//     if (clusterIds.length > 0) {
//       const { data: clusters } = await supabase
//         .from(tables.clusters)
//         .select('id, name, description, ownerUserId')
//         .in('id', clusterIds);
//       clusters?.forEach((c: any) => clusterMap.set(c.id, c));
//     }
// 
//     const inviterUserIds = Array.from(new Set((invites || []).map((i: any) => i.inviterUserId).filter(Boolean)));
//     let inviterMap = new Map();
//     if (inviterUserIds.length > 0) {
//       const { data: users } = await supabase
//         .from('users')
//         .select('id, agentId, name, avatar, emailVerified')
//         .in('id', inviterUserIds);
//       users?.forEach((u: any) => inviterMap.set(u.id, u));
//     }
// 
//     const enrichedInvites = (invites || []).map((i: any) => {
//       const cl = clusterMap.get(i.clusterId);
//       const userObj = inviterMap.get(i.inviterUserId);
//       const inviterAgentId = i.inviterAgentId || userObj?.agentId || 'Owner';
//       const inviterName = userObj?.name || inviterAgentId;
//       const inviterAvatar = userObj?.avatar || '🤖';
//       const inviterEmailVerified = userObj?.emailVerified || false;
//       return {
//         ...i,
//         inviterAgentId,
//         inviterName,
//         inviterAvatar,
//         inviterEmailVerified,
//         cluster: { 
//           id: i.clusterId,
//           name: cl?.name || 'Cluster',
//           description: cl?.description || ''
//         }
//       };
//     });
// 
//     res.json({ success: true, data: enrichedInvites });
//   } catch (err: any) {
//     res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
//   }
// });


// 3. GET /clusters/:clusterId (Get details of a specific cluster)
router.get('/clusters/:clusterId', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_get');
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

    // Query latest authoritative epoch from cluster_epochs
    const { data: latestEpochRecord } = await supabase
      .from('cluster_epochs')
      .select('epoch, keyFingerprint')
      .eq('clusterId', clusterId)
      .order('epoch', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentEpoch = (latestEpochRecord && latestEpochRecord.keyFingerprint && latestEpochRecord.keyFingerprint !== 'PENDING_INIT')
      ? latestEpochRecord.epoch
      : 1;

    res.json({
      success: true,
      data: {
        id: cluster.id,
        name: cluster.name,
        symbol: getClusterSymbol(cluster.id),
        description: cluster.description,
        ownerAgentId: cluster.ownerAgentId,
        membersCount: count || 0,
        epoch: currentEpoch,
        currentEpoch,
        createdAt: cluster.createdAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 3.1 GET /clusters/:clusterId/epoch (Get authoritative cluster epoch)
router.get('/clusters/:clusterId/epoch', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_get_epoch');
    const clusterId = req.params.clusterId as string;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    const isMember = await isClusterMember(supabase, clusterId, userId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden: Not a member of this cluster.' } });
    }

    const { data: latestEpochRecord } = await supabase
      .from('cluster_epochs')
      .select('epoch, keyFingerprint, createdAt')
      .eq('clusterId', clusterId)
      .order('epoch', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentEpoch = (latestEpochRecord && latestEpochRecord.keyFingerprint && latestEpochRecord.keyFingerprint !== 'PENDING_INIT')
      ? latestEpochRecord.epoch
      : 1;

    res.json({
      success: true,
      data: {
        clusterId,
        epoch: currentEpoch,
        currentEpoch,
        keyFingerprint: latestEpochRecord?.keyFingerprint || null
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 3.2 GET /clusters/:clusterId/members/crypto (Get cluster member directory with cryptographic identities & public keys)
router.get('/clusters/:clusterId/members/crypto', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_get_crypto_members');
    const clusterId = req.params.clusterId as string;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    // 1. Check if cluster exists and is not dissolved
    const { data: cluster, error: clError } = await supabase
      .from(tables.clusters)
      .select('id, status, ownerUserId, ownerAgentId, createdAt')
      .eq('id', clusterId)
      .maybeSingle();

    if (clError || !cluster) {
      return res.status(404).json({ success: false, error: { code: 'CLUSTER_NOT_FOUND', message: 'Cluster not found.' } });
    }

    if (cluster.status === 'dissolved') {
      return res.status(403).json({ success: false, error: { code: 'CLUSTER_DISSOLVED', message: 'Forbidden: This cluster has been dissolved.' } });
    }

    // 2. Enforce active membership check for caller
    const isMember = await isClusterMember(supabase, clusterId, userId, req.user?.agentId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden: You must be an active member of this cluster to view the cryptographic member directory.' } });
    }

    // 3. Query cluster members
    const { data: dbMembers, error: memErr } = await supabase
      .from(tables.members)
      .select('id, clusterId, userId, agentId, role, status, createdAt')
      .eq('clusterId', clusterId)
      .order('createdAt', { ascending: true });

    if (memErr) {
      throw new Error(`Failed to query cluster members: ${memErr.message}`);
    }

    // 4. Collect all participant user IDs and agent IDs
    const participantUserIds = new Set<string>();
    const participantAgentIds = new Set<string>();
    (dbMembers || []).forEach((m: any) => {
      if (m.userId) participantUserIds.add(m.userId);
      if (m.agentId) participantAgentIds.add(String(m.agentId).trim());
    });
    if (cluster.ownerUserId) participantUserIds.add(cluster.ownerUserId);
    if (cluster.ownerAgentId) participantAgentIds.add(String(cluster.ownerAgentId).trim());

    let usersById: any[] = [];
    let usersByAgentId: any[] = [];
    if (participantUserIds.size > 0) {
      const { data } = await supabase
        .from('users')
        .select('id, name, agentId, avatar, bio, emailVerified, account_type, role, is_slave, master_id, is_master_primary')
        .in('id', Array.from(participantUserIds));
      if (data) usersById = data;
    }
    if (participantAgentIds.size > 0) {
      const { data } = await supabase
        .from('users')
        .select('id, name, agentId, avatar, bio, emailVerified, account_type, role, is_slave, master_id, is_master_primary')
        .in('agentId', Array.from(participantAgentIds));
      if (data) usersByAgentId = data;
    }

    const users = [...usersById, ...usersByAgentId];
    const userMap = new Map<string, any>();
    users.forEach((u: any) => {
      if (u.id) userMap.set(String(u.id).toLowerCase(), u);
      if (u.agentId) userMap.set(String(u.agentId).toLowerCase(), u);
    });

    // Populate E2EE public keys and metadata from user auth metadata
    for (const uId of Array.from(participantUserIds)) {
      try {
        const { data: authData } = await supabase.auth.admin.getUserById(uId);
        const meta = authData?.user?.user_metadata;
        if (meta?.e2eePublicKey) {
          const existing = userMap.get(String(uId).toLowerCase()) || {};
          existing.e2eePublicKey = meta.e2eePublicKey;
          existing.e2eeKeyEpoch = meta.e2eeKeyEpoch || 1;
          existing.e2eePublicKeyFingerprint = meta.e2eePublicKeyFingerprint || null;
          userMap.set(String(uId).toLowerCase(), existing);
          if (existing.agentId) {
            userMap.set(String(existing.agentId).toLowerCase(), existing);
          }
        }
      } catch {}
    }

    // Query latest epoch for membership version
    const { data: latestEpochRecord } = await supabase
      .from('cluster_epochs')
      .select('epoch')
      .eq('clusterId', clusterId)
      .order('epoch', { ascending: false })
      .limit(1)
      .maybeSingle();

    const membershipVersion = latestEpochRecord?.epoch || 1;

    const membersList = (dbMembers || []).map((m: any) => {
      const mAgentId = m.agentId || m.agent_id;
      const mUserId = m.userId || m.user_id;
      const u = (mAgentId ? userMap.get(String(mAgentId).toLowerCase()) : null) || 
                (mUserId ? userMap.get(String(mUserId).toLowerCase()) : null);

      const pubKey = u?.e2eePublicKey || m.e2eePublicKey || null;
      let keyStatus = 'missing';
      if (pubKey && typeof pubKey === 'string' && pubKey.trim().length > 0) {
        keyStatus = 'available';
      }

      const isSlave = Boolean(
        u?.account_type === 'slave' ||
        u?.role === 'slave' ||
        u?.is_slave === true ||
        (u?.master_id && !u?.is_master_primary) ||
        m.role === 'slave' ||
        m.is_slave === true ||
        (mAgentId && mAgentId.includes('+AMR-'))
      );

      return {
        agentId: mAgentId || u?.agentId || 'UNKNOWN_AGENT',
        name: (u?.name && String(u.name).trim()) || mAgentId || 'Cluster Member',
        bio: u?.bio || null,
        publicKey: pubKey,
        keyId: u?.e2eePublicKeyFingerprint || (pubKey ? `key_${mAgentId || 'agent'}` : null),
        keyVersion: u?.e2eeKeyEpoch || membershipVersion,
        keyStatus,
        membershipRole: m.role || 'member',
        status: m.status || 'active',
        isSlave
      };
    });

    // Ensure cluster owner/admin is included in membersList
    const ownerAgentId = cluster.ownerAgentId;
    const hasOwner = membersList.some((mem: any) => 
      ownerAgentId && mem.agentId?.toLowerCase() === ownerAgentId.toLowerCase()
    );
    if (!hasOwner && (cluster.ownerAgentId || cluster.ownerUserId)) {
      const oAid = cluster.ownerAgentId;
      const oUid = cluster.ownerUserId;
      const ownerInfo = (oAid ? userMap.get(String(oAid).toLowerCase()) : null) || 
                        (oUid ? userMap.get(String(oUid).toLowerCase()) : null);
      const adminAgentId = cluster.ownerAgentId || 'AMR-TW43-24WU';
      const adminName = (ownerInfo?.name && String(ownerInfo.name).trim()) || adminAgentId;
      const ownerPubKey = ownerInfo?.e2eePublicKey || null;
      
      membersList.unshift({
        agentId: adminAgentId,
        name: adminName,
        avatar: ownerInfo?.avatar || '🤖',
        bio: ownerInfo?.bio || null,
        publicKey: ownerPubKey,
        keyId: ownerInfo?.e2eePublicKeyFingerprint || (ownerPubKey ? `key_${adminAgentId}` : null),
        keyVersion: ownerInfo?.e2eeKeyEpoch || membershipVersion,
        keyStatus: (ownerPubKey && typeof ownerPubKey === 'string' && ownerPubKey.trim().length > 0) ? 'available' : 'missing',
        membershipRole: 'owner',
        status: 'active',
        isSlave: false
      });
    }

    res.json({
      success: true,
      data: {
        clusterId,
        membershipVersion,
        members: membersList
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 4. PATCH /clusters/:clusterId (Update cluster metadata - Human only)
router.patch('/clusters/:clusterId', requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_update');
    const clusterId = req.params.clusterId as string;
    const { name, description, memberAgentIds } = req.body;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;
    const agentId = req.user!.agentId;

    // Verify ownership
    const { data: cluster } = await supabase
      .from(tables.clusters)
      .select('ownerUserId, ownerAgentId, name, status')
      .eq('id', clusterId)
      .maybeSingle();

    if (!cluster) {
      return res.status(404).json({ success: false, error: { message: 'Cluster not found.' } });
    }

    if (cluster.status === 'dissolved') {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: This cluster has been dissolved and cannot be modified.' } });
    }

    const isOwner = cluster.ownerUserId === userId || 
                    (agentId && cluster.ownerAgentId && cluster.ownerAgentId.toLowerCase() === agentId.toLowerCase()) || 
                    !cluster.ownerUserId;
    const isAdmin = await isClusterAdmin(supabase, clusterId, userId, agentId);
    const isMaster = Boolean(
      req.user?.account_type === 'master' ||
      req.user?.isMasterUser === true ||
      req.user?.is_master_primary === true ||
      (req.user as any)?.role === 'master'
    );

    if (!isOwner && !isAdmin && !isMaster) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: Only an admin or master can update this cluster.' } });
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

    // Sync memberAgentIds if provided
    if (Array.isArray(memberAgentIds)) {
      const cleanAgentIds = memberAgentIds.map(id => String(id).trim()).filter(Boolean);
      const cleanSet = new Set(cleanAgentIds.map(id => id.toLowerCase()));

      // 1. Fetch current members
      const { data: currentMembers } = await supabase
        .from(tables.members)
        .select('id, agentId, userId, role')
        .eq('clusterId', clusterId);

      // 2. Remove members who are not owner/admin and not in new memberAgentIds
      const membersToDelete: string[] = [];
      (currentMembers || []).forEach((m: any) => {
        const isOwnerOrAdmin = m.role === 'admin' || m.role === 'owner';
        if (!isOwnerOrAdmin) {
          const mKey = (m.agentId || '').toLowerCase().replace(/^@+/, '');
          if (!cleanSet.has(mKey)) {
            membersToDelete.push(m.id);
          }
        }
      });

      if (membersToDelete.length > 0) {
        await supabase
          .from(tables.members)
          .delete()
          .in('id', membersToDelete);
      }

      // 3. Find which members need to be added
      const existingAgentKeys = new Set(
        (currentMembers || [])
          .filter((m: any) => !membersToDelete.includes(m.id))
          .map((m: any) => (m.agentId || '').toLowerCase())
      );
      if (agentId) existingAgentKeys.add(agentId.toLowerCase());

      const toAdd = cleanAgentIds.filter(id => !existingAgentKeys.has(id.toLowerCase()));
      if (toAdd.length > 0) {
        const { data: allUsers } = await supabase
          .from('users')
          .select('id, agentId');

        const now = new Date().toISOString();
        const memberInserts: any[] = [];
        const addedKeys = new Set<string>();

        toAdd.forEach((cId) => {
          const cNormalized = cId.replace(/^@+/, '').toLowerCase();
          if (!addedKeys.has(cNormalized)) {
            addedKeys.add(cNormalized);
            const matched = (allUsers || []).find((u: any) => 
              (u.agentId && u.agentId.toLowerCase() === cNormalized) || 
              (u.id && u.id.toLowerCase() === cNormalized)
            );
            if (matched) {
              memberInserts.push({
                id: `member_${crypto.randomUUID()}`,
                clusterId,
                userId: matched.id,
                agentId: matched.agentId || cId,
                role: 'member',
                createdAt: now
              });
            }
          }
        });

        if (memberInserts.length > 0) {
          await supabase.from(tables.members).insert(memberInserts);
        }
      }
    }

    const effectiveClusterName = updates.name || cluster.name || 'Cluster';
    // Broadcast floor activity: [Agent Name] updated Cluster "[Cluster Name]" configuration
    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `updated Cluster "${effectiveClusterName}" configuration`,
      type: 'cluster',
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

// 5. DELETE /clusters/:clusterId (Disband/Delete a cluster - Human only)
router.delete('/clusters/:clusterId', requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_delete');
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

    // Notify all members of cluster disbandment
    try {
      const { data: membersList } = await supabase
        .from(tables.members)
        .select('userId')
        .eq('clusterId', clusterId)
        .neq('userId', userId);
      if (membersList && membersList.length > 0) {
        const events = membersList
          .filter((m: any) => m.userId)
          .map((m: any) => ({
            user_id: m.userId,
            type: 'CLUSTER_DISBANDED',
            sender_id: req.user!.agentId || req.user!.id,
            target_id: clusterId,
            details: `Cluster "${clusterName}" was disbanded by owner`,
            created_at: new Date().toISOString()
          }));
        if (events.length > 0) {
          try {
            await supabase.from('external_events').insert(events);
          } catch (e) {}
        }
      }
    } catch (e) {}

    // Broadcast floor activity: [Agent Name] disbanded Cluster "[Cluster Name]"
    floorActivityService.recordFloorActivity({
      agentId: req.user!.agentId || req.user!.id,
      agentName: req.user!.name,
      avatar: req.user!.avatar,
      emailVerified: req.user!.emailVerified,
      text: `disbanded Cluster "${clusterName}"`,
      type: 'cluster',
      cluster: { name: clusterName, id: clusterId, symbol: getClusterSymbol(clusterId) }
    }).catch(console.warn);

    res.json({ success: true, message: 'Cluster successfully disbanded.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 12. POST /clusters/:clusterId/keys (Distribute key package)
router.post('/clusters/:clusterId/keys', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_key_distribute');
    const clusterId = req.params.clusterId as string;
    const { epoch, keyFingerprint, distributionMap, senderPublicKey } = req.body;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    // Verify requester is admin or owner (same as advance-epoch)
    const isAdmin = await isClusterAdmin(supabase, clusterId, userId);
    if (!isAdmin) {
       return res.status(403).json({ 
         success: false, 
         error: { code: 'FORBIDDEN', message: 'Forbidden: Only cluster admins or owners can distribute keys and establish cluster epochs.' } 
       });
    }

    if (!keyFingerprint || typeof keyFingerprint !== 'string' || keyFingerprint.trim().length === 0 || keyFingerprint === 'PENDING_INIT') {
      return res.status(400).json({ 
        success: false, 
        error: { code: 'INVALID_KEY_FINGERPRINT', message: 'A valid authoritative keyFingerprint is required.' } 
      });
    }

    if (!distributionMap || typeof distributionMap !== 'object' || Object.keys(distributionMap).length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: { code: 'EMPTY_DISTRIBUTION_MAP', message: 'Distribution map cannot be empty.' } 
      });
    }

    // Query active members and populate their E2EE public keys from auth metadata
    const { data: rawActiveMembers } = await supabase
      .from(tables.members)
      .select('agentId, userId, status')
      .eq('clusterId', clusterId)
      .eq('status', 'active');

    const activeMembers = [];
    for (const m of (rawActiveMembers || [])) {
      let pubKey = m.e2eePublicKey || m.publicKey || null;
      if (!pubKey && m.userId) {
        try {
          const { data: userAuth } = await supabase.auth.admin.getUserById(m.userId);
          pubKey = userAuth?.user?.user_metadata?.e2eePublicKey || null;
        } catch {}
      }
      activeMembers.push({
        ...m,
        e2eePublicKey: pubKey
      });
    }

    const activeIdentifiers = new Set<string>();
    for (const m of (activeMembers || [])) {
      if (m.agentId) activeIdentifiers.add(String(m.agentId).trim().replace(/^@/, '').toUpperCase());
      if (m.userId) activeIdentifiers.add(String(m.userId).trim().toUpperCase());
    }

    const distKeys = Object.keys(distributionMap || {}).map(k => String(k).trim().replace(/^@/, '').toUpperCase());

    // Reject unauthorized or inactive recipients - do NOT silently skip!
    for (const recipientAgentId of Object.keys(distributionMap as any)) {
      const cleanRId = String(recipientAgentId).trim().replace(/^@/, '').toUpperCase();
      if (!activeIdentifiers.has(cleanRId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED_RECIPIENT',
            message: `Recipient ${recipientAgentId} is not an active member of this cluster.`
          }
        });
      }
      const pkg = (distributionMap as any)[recipientAgentId];
      if (!pkg || !pkg.iv || !pkg.key || !isValidBase64String(pkg.iv) || !isValidBase64String(pkg.key)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_KEY_PACKAGE',
            message: `Key package for recipient ${recipientAgentId} must contain valid Base64 iv and key.`
          }
        });
      }
    }

    // Verify that every active member with a registered public key has a key package
    for (const actMember of (activeMembers || [])) {
      const aid = actMember.agentId ? String(actMember.agentId).trim().replace(/^@/, '').toUpperCase() : '';
      const uid = actMember.userId ? String(actMember.userId).trim().toUpperCase() : '';
      const hasPkg = distKeys.includes(aid) || (uid && distKeys.includes(uid));
      const hasPubKey = actMember.e2eePublicKey || actMember.publicKey;
      if (!hasPkg && hasPubKey) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INCOMPLETE_DISTRIBUTION_MAP',
            message: `Key distribution map omits required active member ${actMember.agentId || actMember.userId}.`
          }
        });
      }
    }

    let effectiveSenderPublicKey = senderPublicKey;
    if (!effectiveSenderPublicKey) {
      try {
        const { data: senderAuthData } = await supabase.auth.admin.getUserById(userId);
        effectiveSenderPublicKey = senderAuthData?.user?.user_metadata?.e2eePublicKey;
      } catch {}
    }

    const result = await clusterService.establishClusterEpoch(clusterId, {
      epoch: typeof epoch === 'number' && epoch > 0 ? epoch : undefined,
      keyFingerprint: keyFingerprint.trim(),
      distributionMap,
      senderPublicKey: effectiveSenderPublicKey
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message, code: err.code || 'KEY_DISTRIBUTION_FAILED' } });
  }
});

// 13. POST /clusters/:clusterId/advance-epoch (Trigger rotation with key distribution)
router.post('/clusters/:clusterId/advance-epoch', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_advance_epoch');
    const clusterId = req.params.clusterId as string;
    const { reason, keyFingerprint, distributionMap, senderPublicKey } = req.body;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    // Verify requester is admin or owner
    const isAdmin = await isClusterAdmin(supabase, clusterId, userId);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Forbidden: Only cluster admins or owners can advance epoch.' }
      });
    }

    if (!keyFingerprint || typeof keyFingerprint !== 'string' || keyFingerprint === 'PENDING_INIT') {
      return res.status(400).json({
        success: false,
        error: { code: 'KEY_MATERIAL_REQUIRED', message: 'A valid keyFingerprint is required to advance epoch.' }
      });
    }

    if (!distributionMap || typeof distributionMap !== 'object' || Object.keys(distributionMap).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'EMPTY_DISTRIBUTION_MAP', message: 'A non-empty distributionMap for active members is required.' }
      });
    }

    // Validate all recipients are active members and check completeness
    const { data: rawActiveMembersEpochAdv } = await supabase
      .from(tables.members)
      .select('agentId, userId, status')
      .eq('clusterId', clusterId)
      .eq('status', 'active');

    const activeMembers = [];
    for (const m of (rawActiveMembersEpochAdv || [])) {
      let pubKey = m.e2eePublicKey || m.publicKey || null;
      if (!pubKey && m.userId) {
        try {
          const { data: userAuth } = await supabase.auth.admin.getUserById(m.userId);
          pubKey = userAuth?.user?.user_metadata?.e2eePublicKey || null;
        } catch {}
      }
      activeMembers.push({
        ...m,
        e2eePublicKey: pubKey
      });
    }

    const activeIdentifiers = new Set<string>();
    for (const m of (activeMembers || [])) {
      if (m.agentId) activeIdentifiers.add(String(m.agentId).trim().replace(/^@/, '').toUpperCase());
      if (m.userId) activeIdentifiers.add(String(m.userId).trim().toUpperCase());
    }

    const distKeys = Object.keys(distributionMap || {}).map(k => String(k).trim().replace(/^@/, '').toUpperCase());

    for (const recipientAgentId of Object.keys(distributionMap as any)) {
      const cleanRId = String(recipientAgentId).trim().replace(/^@/, '').toUpperCase();
      if (!activeIdentifiers.has(cleanRId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED_RECIPIENT',
            message: `Recipient ${recipientAgentId} is not an active member of this cluster.`
          }
        });
      }
      const pkg = (distributionMap as any)[recipientAgentId];
      if (!pkg || !pkg.iv || !pkg.key || !isValidBase64String(pkg.iv) || !isValidBase64String(pkg.key)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_KEY_PACKAGE',
            message: `Key package for recipient ${recipientAgentId} must contain valid Base64 iv and key.`
          }
        });
      }
    }

    for (const actMember of (activeMembers || [])) {
      const aid = actMember.agentId ? String(actMember.agentId).trim().replace(/^@/, '').toUpperCase() : '';
      const uid = actMember.userId ? String(actMember.userId).trim().toUpperCase() : '';
      const hasPkg = distKeys.includes(aid) || (uid && distKeys.includes(uid));
      const hasPubKey = actMember.e2eePublicKey || actMember.publicKey;
      if (!hasPkg && hasPubKey) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INCOMPLETE_DISTRIBUTION_MAP',
            message: `Key distribution map omits required active member ${actMember.agentId || actMember.userId}.`
          }
        });
      }
    }

    let effectiveSenderPublicKey = senderPublicKey;
    if (!effectiveSenderPublicKey) {
      try {
        const { data: senderAuthData } = await supabase.auth.admin.getUserById(userId);
        effectiveSenderPublicKey = senderAuthData?.user?.user_metadata?.e2eePublicKey;
      } catch {}
    }

    const result = await clusterService.advanceEpoch(clusterId, {
      keyFingerprint: keyFingerprint.trim(),
      distributionMap,
      senderPublicKey: effectiveSenderPublicKey,
      reason
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});


// // 8. GET /clusters/:clusterId/invites (List invites for a specific cluster)
// router.get('/clusters/:clusterId/invites', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
//   ...
// });


// // 8.1 DELETE /clusters/:clusterId/invites/:inviteId (Revoke pending invite)
// router.delete('/clusters/:clusterId/invites/:inviteId', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
//   ...
// });





// 10. PATCH /clusters/:clusterId/members/:memberAgentId/role (Update member role: admin/member - Human authorized only)
router.patch('/clusters/:clusterId/members/:memberAgentId/role', requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_member_role_update');
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

    // Inbound event for target member
    if (member.userId) {
      try {
        await supabase.from('external_events').insert({
          user_id: member.userId,
          type: 'CLUSTER_ROLE_UPDATED',
          sender_id: req.user!.agentId || req.user!.id,
          target_id: clusterId,
          created_at: new Date().toISOString()
        });
      } catch (e) {}
    }

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
      text: `modified @${targetMemberName}'s role in Cluster "${clusterName}" to ${role}`,
      type: 'cluster',
      peerName: targetMemberName,
      peerAgentId: memberAgentId,
      cluster: { name: clusterName, id: clusterId, symbol: getClusterSymbol(clusterId) }
    }).catch(console.warn);

    res.json({ success: true, message: `Member role updated to ${role} successfully.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 11. POST /clusters/:clusterId/messages (Send secure encrypted message)
router.post('/clusters/:clusterId/messages', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_message_create');
    const clusterId = req.params.clusterId as string;
    const body = req.body || {};
    const { content, message: bodyMessage, ciphertext, nonce, version, keyEpoch, sequence, seq, keys } = body;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;
    const agentId = req.user!.agentId;

    // 1. Cluster existence and dissolution check
    const { data: cluster, error: clusterErr } = await supabase
      .from(tables.clusters)
      .select('id, status')
      .eq('id', clusterId)
      .maybeSingle();

    if (clusterErr || !cluster) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CLUSTER_NOT_FOUND',
          message: 'Cluster not found.'
        }
      });
    }

    if (cluster.status === 'dissolved') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'CLUSTER_DISSOLVED',
          message: 'Forbidden: This cluster has been dissolved. Messaging is disabled.'
        }
      });
    }

    // 2. Active membership check
    const { data: memberRecord, error: memErr } = await supabase
      .from(tables.members)
      .select('id, status')
      .eq('clusterId', clusterId)
      .eq('userId', userId)
      .maybeSingle();

    if (memErr || !memberRecord || memberRecord.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Forbidden: You must be an active member of this cluster to send messages.'
        }
      });
    }

    // 3. Sender registered E2EE public key check & trust validation
    let senderPublicKey: any = null;
    let senderMeta: Record<string, any> = {};
    try {
      const { data: senderAuthData } = await supabase.auth.admin.getUserById(userId);
      senderMeta = senderAuthData?.user?.user_metadata || {};
      senderPublicKey = senderMeta.e2eePublicKey;
    } catch {
      return res.status(403).json({
        success: false,
        error: {
          code: 'E2EE_KEY_REQUIRED',
          message: 'Register an E2EE public key via PUT /api/agents/me/e2ee before sending private messages.'
        }
      });
    }

    if (!senderPublicKey || typeof senderPublicKey !== 'string' || senderPublicKey.trim().length === 0) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'E2EE_KEY_REQUIRED',
          message: 'Register an E2EE public key via PUT /api/agents/me/e2ee before sending private messages.'
        }
      });
    }

    try {
      const parsedKey = typeof senderPublicKey === 'string' ? JSON.parse(senderPublicKey) : senderPublicKey;
      if (!parsedKey || parsedKey.kty !== 'EC' || parsedKey.crv !== 'P-256' || !parsedKey.x || !parsedKey.y) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'E2EE_KEY_REQUIRED',
            message: 'Register an E2EE public key via PUT /api/agents/me/e2ee before sending private messages.'
          }
        });
      }
      const canonicalJwk = JSON.stringify({ crv: parsedKey.crv || 'P-256', kty: parsedKey.kty || 'EC', x: parsedKey.x, y: parsedKey.y });
      const digestHex = crypto.createHash('sha256').update(canonicalJwk).digest('hex').toUpperCase();
      const computedFingerprint = 'SHA256:' + (digestHex.match(/.{2}/g)?.join(':') || digestHex);
      if (senderMeta.e2eePublicKeyFingerprint && senderMeta.e2eePublicKeyFingerprint !== computedFingerprint) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INVALID_KEY_SIGNATURE',
            message: 'Sender E2EE public key fingerprint mismatch. Trust verification failed.'
          }
        });
      }
    } catch {
      return res.status(403).json({
        success: false,
        error: {
          code: 'E2EE_KEY_REQUIRED',
          message: 'Register an E2EE public key via PUT /api/agents/me/e2ee before sending private messages.'
        }
      });
    }

    // 4. Authoritative active members query
    const { data: authoritativeActiveMembers, error: peerErr } = await supabase
      .from(tables.members)
      .select('userId, agentId, status')
      .eq('clusterId', clusterId)
      .eq('status', 'active');

    if (peerErr || !authoritativeActiveMembers) {
      throw new Error(`Failed to query authoritative cluster members: ${peerErr?.message || 'Unknown error'}`);
    }

    // 4.5 Server-side authoritative recipient completeness enforcement
    try {
      const decodedEnvStr = Buffer.from(ciphertext.trim(), 'base64').toString('utf8');
      const parsedEnv = JSON.parse(decodedEnvStr);
      if (parsedEnv && (parsedEnv.type === 'AAMARVA_GROUP_E2EE_v1' || parsedEnv.type === 'AAMARVA_GROUP_E2EE_v2') && parsedEnv.keys) {
        const wrappedKeys = parsedEnv.keys || {};
        const wrappedIds = Object.keys(wrappedKeys).map(id => String(id).trim().toUpperCase());
        const activeIds = new Set(authoritativeActiveMembers.map(m => String(m.agentId || m.userId).trim().toUpperCase()));

        for (const actMember of authoritativeActiveMembers) {
          const aid = String(actMember.agentId || actMember.userId).trim().toUpperCase();
          const hasKey = wrappedIds.includes(aid) || (actMember.userId && wrappedIds.includes(String(actMember.userId).trim().toUpperCase()));
          if (!hasKey) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'INCOMPLETE_RECIPIENT_WRAPPING',
                message: `Server-side recipient completeness check failed. Group message envelope omits required active member ${actMember.agentId || actMember.userId}.`
              }
            });
          }
        }

        for (const wId of wrappedIds) {
          if (!activeIds.has(wId)) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'UNAUTHORIZED_RECIPIENT_KEY',
                message: `Group message envelope includes wrapped key for unauthorized or inactive recipient (${wId}).`
              }
            });
          }
        }
      }
    } catch (compErr: any) {
      if (compErr?.status === 400) return compErr;
    }

    // 5. Strict E2EE validation: reject any plaintext content (content or message fields)
    if (content != null || bodyMessage != null || body?.message != null || body?.content != null) {
      return res.status(400).json({ 
        success: false, 
        error: { 
          code: 'PLAINTEXT_REJECTED', 
          message: 'Plaintext content is strictly forbidden for private messages. AAMARVA is zero-knowledge; encryption must be performed agent-side.',
          instruction: 'Remove "content" or "message" fields. Provide a valid E2EE envelope: { ciphertext: string, nonce: string, version: number, keyEpoch: number }.'
        } 
      });
    }

    // 6. Strict Ciphertext presence and type validation
    if (ciphertext === undefined || ciphertext === null || typeof ciphertext !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CIPHERTEXT',
          message: 'Private messages must include a ciphertext string.',
          required_fields: {
            ciphertext: 'Base64 encoded AES-256-GCM ciphertext',
            nonce: 'Base64 encoded 96-bit initialization vector',
            version: 'Optional (defaults to 1)',
            keyEpoch: 'Optional (defaults to 1)'
          }
        }
      });
    }

    const trimmedCiphertext = ciphertext.trim();
    if (trimmedCiphertext.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EMPTY_CIPHERTEXT',
          message: 'Ciphertext cannot be empty.',
        },
      });
    }

    if (trimmedCiphertext.length > MAX_BASE64_CIPHERTEXT_LENGTH) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Ciphertext exceeds maximum allowed payload size (100 KiB / 102,400 bytes).',
        },
      });
    }

    // 7. Strict Ciphertext transport encoding validation (Base64 representation)
    if (!isValidBase64String(trimmedCiphertext)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CIPHERTEXT_ENCODING',
          message: 'Invalid ciphertext transport encoding. Base64-encoded ciphertext required.',
        },
      });
    }

    let cipherBuf: Buffer;
    try {
      cipherBuf = Buffer.from(trimmedCiphertext, 'base64');
    } catch {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CIPHERTEXT_ENCODING',
          message: 'Failed to decode ciphertext transport representation.',
        },
      });
    }

    if (cipherBuf.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EMPTY_CIPHERTEXT',
          message: 'Decoded ciphertext bytes cannot be empty.',
        },
      });
    }

    if (cipherBuf.length > MAX_DECODED_CIPHERTEXT_BYTES) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Decoded ciphertext bytes exceed maximum allowed payload size (100 KiB / 102,400 bytes).',
        },
      });
    }

    // 8. Nonce presence and validation: 12-byte IV for AES-256-GCM
    if (nonce === undefined || nonce === null || typeof nonce !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NONCE',
          message: 'Private messages must include a valid Base64-encoded nonce.',
        },
      });
    }

    const trimmedNonce = nonce.trim();
    if (trimmedNonce.length === 0 || !isValidBase64String(trimmedNonce)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NONCE',
          message: 'Invalid nonce encoding. Base64-encoded initialization vector required.',
        },
      });
    }

    try {
      const nonceBuf = Buffer.from(trimmedNonce, 'base64');
      if (nonceBuf.length !== 12) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_NONCE',
            message: 'Invalid nonce. AES-256-GCM requires a valid 96-bit (12-byte) initialization vector.',
          },
        });
      }
    } catch {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NONCE',
          message: 'Invalid nonce encoding. Base64-encoded initialization vector required.',
        },
      });
    }

    // 9. Strict version validation (only version 1 is supported)
    let parsedVersion = 1;
    if (version !== undefined && version !== null) {
      if (typeof version !== 'number' || !Number.isFinite(version) || !Number.isInteger(version) || version !== 1) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UNSUPPORTED_VERSION',
            message: 'Unsupported E2EE protocol version. Only version 1 is supported.',
          },
        });
      }
      parsedVersion = version;
    }

    // 10. Strict keyEpoch validation (positive integer when supplied)
    let parsedKeyEpoch = 1;
    if (keyEpoch !== undefined && keyEpoch !== null) {
      if (typeof keyEpoch !== 'number' || !Number.isFinite(keyEpoch) || !Number.isInteger(keyEpoch) || keyEpoch < 1) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_KEY_EPOCH',
            message: 'Invalid keyEpoch. When supplied, keyEpoch must be a positive integer (>= 1). Malformed, non-numeric, decimal, or negative values are rejected.',
          },
        });
      }
      parsedKeyEpoch = keyEpoch;
    }

    // Verify keyEpoch against authoritative cluster_epochs if established
    const { data: latestClusterEpoch } = await supabase
      .from('cluster_epochs')
      .select('epoch, keyFingerprint')
      .eq('clusterId', clusterId)
      .order('epoch', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestClusterEpoch && latestClusterEpoch.keyFingerprint && latestClusterEpoch.keyFingerprint !== 'PENDING_INIT') {
      if (parsedKeyEpoch !== latestClusterEpoch.epoch) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_KEY_EPOCH',
            message: `Invalid keyEpoch ${parsedKeyEpoch}. Must match authoritative cluster epoch ${latestClusterEpoch.epoch}.`
          }
        });
      }
    }

    // Check if cluster uses key distribution packages for this epoch
    const { data: keyDistRecords } = await supabase
      .from('cluster_key_distributions')
      .select('recipientAgentId')
      .eq('clusterId', clusterId)
      .eq('epoch', parsedKeyEpoch);

    const hasDistributions = Boolean(keyDistRecords && keyDistRecords.length > 0);

    if (!hasDistributions) {
      // Fallback: Verify keyEpoch against registered active key epochs for cluster participants when key distributions are not used
      const senderActiveEpoch = typeof senderMeta.e2eeKeyEpoch === 'number' ? senderMeta.e2eeKeyEpoch : 1;
      const senderEpochHistory = (senderMeta.e2eeEpochHistory as Record<string, any>) || {};
      const senderHasEpoch = parsedKeyEpoch === senderActiveEpoch ||
        Boolean(senderEpochHistory[String(parsedKeyEpoch)] && senderEpochHistory[String(parsedKeyEpoch)].publicKey);

      if (!senderHasEpoch) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'KEY_EPOCH_NOT_FOUND',
            message: `Invalid keyEpoch ${parsedKeyEpoch}. Key epoch ${parsedKeyEpoch} not found in registered active key or epoch history for cluster participants.`
          }
        });
      }

      for (const peer of authoritativeActiveMembers) {
        if (!peer.userId) continue;
        try {
          const { data: peerAuthData } = await supabase.auth.admin.getUserById(peer.userId);
          const peerMeta = peerAuthData?.user?.user_metadata || {};
          if (peerMeta.e2eePublicKey) {
            const peerActiveEpoch = typeof peerMeta.e2eeKeyEpoch === 'number' ? peerMeta.e2eeKeyEpoch : 1;
            const peerEpochHistory = (peerMeta.e2eeEpochHistory as Record<string, any>) || {};
            const peerHasEpoch = parsedKeyEpoch === peerActiveEpoch ||
              Boolean(peerEpochHistory[String(parsedKeyEpoch)] && peerEpochHistory[String(parsedKeyEpoch)].publicKey);

            if (!peerHasEpoch) {
              return res.status(400).json({
                success: false,
                error: {
                  code: 'KEY_EPOCH_NOT_FOUND',
                  message: `Invalid keyEpoch ${parsedKeyEpoch}. Key epoch ${parsedKeyEpoch} not found in registered active key or epoch history for cluster participants.`
                }
              });
            }
          }
        } catch {
          // Ignore lookup failures for optional peer keys in fallback mode
        }
      }
    }

    // 11. Strict sequence validation (non-negative integer when supplied)
    let parsedSequence: number | undefined = undefined;
    const rawSeq = sequence ?? seq;
    if (rawSeq !== undefined && rawSeq !== null) {
      if (typeof rawSeq !== 'number' || !Number.isFinite(rawSeq) || !Number.isInteger(rawSeq) || rawSeq < 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SEQUENCE',
            message: 'Invalid sequence. When supplied, sequence must be a non-negative integer (>= 0).',
          },
        });
      }
      parsedSequence = rawSeq;
    }

    const messageId = `msg_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const insertPayload: any = {
      id: messageId,
      clusterId,
      senderUserId: userId,
      senderAgentId: agentId,
      ciphertext: trimmedCiphertext,
      nonce: trimmedNonce,
      version: parsedVersion,
      keyEpoch: parsedKeyEpoch,
      sequence: parsedSequence !== undefined ? parsedSequence : null,
      keys: keys || null,
      createdAt: now
    };

    let { error: msgErr } = await supabase
      .from(tables.messages)
      .insert(insertPayload);

    if (msgErr && msgErr.message?.includes('schema cache')) {
      const baselinePayload = {
        id: messageId,
        clusterId,
        senderUserId: userId,
        senderAgentId: agentId,
        ciphertext: trimmedCiphertext,
        nonce: trimmedNonce,
        createdAt: now
      };
      const retry = await supabase.from(tables.messages).insert(baselinePayload);
      msgErr = retry.error;
    }

    if (msgErr) {
      throw new Error(`Failed to send message: ${msgErr.message}`);
    }

    // Log outbound footprint
    try {
      await logAgentFootprint(
        userId,
        'CLUSTER_MESSAGE_SENT',
        'Transmitted secure end-to-end encrypted payload to cluster',
        clusterId,
        agentId
      );
    } catch (e) {
      console.error('Failed to log cluster message footprint:', e);
    }

    // Log inbound external event for active peer members
    try {
      if (authoritativeActiveMembers && authoritativeActiveMembers.length > 0) {
        for (const peer of authoritativeActiveMembers) {
          if (peer.userId) {
            await logExternalEvent(
              peer.userId,
              'CLUSTER_MESSAGE_RECEIVED',
              agentId || 'Agent',
              messageId
            );
          }
        }
      }
    } catch (e) {
      console.error('Failed to log cluster message external event:', e);
    }

    res.status(201).json({
      success: true,
      data: {
        id: messageId,
        messageId,
        clusterId,
        senderAgentId: agentId,
        content: null,
        ciphertext: trimmedCiphertext,
        nonce: trimmedNonce,
        version: parsedVersion,
        keyEpoch: parsedKeyEpoch,
        sequence: parsedSequence !== undefined ? parsedSequence : null,
        createdAt: now
      },
      messageId,
      createdAt: now
    });
  } catch (err: any) {
    console.error('Route handler error [POST /api/clusters/:clusterId/messages]:', err);
    const status = err.statusCode || (err.message?.includes('Forbidden') ? 403 : err.message?.includes('not found') ? 404 : 400);
    res.status(status).json({ success: false, error: { message: err?.message || 'Internal server error.', code: err?.code } });
  }
});

// 12. GET /clusters/:clusterId/messages (Get messages)
router.get('/clusters/:clusterId/messages', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_message_list');
    const clusterId = req.params.clusterId as string;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    // Check cluster existence and dissolution
    const { data: cluster, error: clusterErr } = await supabase
      .from(tables.clusters)
      .select('id, status')
      .eq('id', clusterId)
      .maybeSingle();

    if (clusterErr || !cluster) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CLUSTER_NOT_FOUND',
          message: 'Cluster not found.'
        }
      });
    }

    if (cluster.status === 'dissolved') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'CLUSTER_DISSOLVED',
          message: 'Forbidden: This cluster has been dissolved.'
        }
      });
    }

    // Verify membership
    const isMember = await isClusterMember(supabase, clusterId, userId);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Forbidden: You must be a member of this cluster to view messages.'
        }
      });
    }

    const { data: messages, error: msgErr } = await supabase
      .from(tables.messages)
      .select('*')
      .eq('clusterId', clusterId)
      .order('createdAt', { ascending: true });

    if (msgErr) {
      throw new Error(`Failed to fetch messages: ${msgErr.message}`);
    }

    // Resolve sender public keys so client can decrypt without extra roundtrips
    const senderUserIds = Array.from(new Set((messages || []).map((m: any) => m.senderUserId).filter(Boolean)));
    const senderKeyMap = new Map<string, string>();
    for (const sUid of senderUserIds) {
      try {
        const { data: sAuth } = await supabase.auth.admin.getUserById(sUid);
        if (sAuth?.user?.user_metadata?.e2eePublicKey) {
          senderKeyMap.set(String(sUid), sAuth.user.user_metadata.e2eePublicKey);
        }
      } catch {}
    }

    res.json({
      success: true,
      data: (messages || []).map((m: any) => ({
        id: m.id,
        messageId: m.id,
        clusterId: m.clusterId,
        senderAgentId: m.senderAgentId,
        senderPublicKey: m.senderUserId ? (senderKeyMap.get(String(m.senderUserId)) || null) : null,
        content: m.content !== undefined ? m.content : null,
        ciphertext: m.ciphertext,
        nonce: m.nonce,
        version: m.version !== undefined && m.version !== null ? m.version : 1,
        keyEpoch: m.keyEpoch !== undefined && m.keyEpoch !== null ? m.keyEpoch : 1,
        sequence: m.sequence !== undefined ? m.sequence : null,
        createdAt: m.createdAt
      }))
    });
  } catch (err: any) {
    console.error('Route handler error [GET /api/clusters/:clusterId/messages]:', err);
    const status = err.statusCode || (err.message?.includes('Forbidden') ? 403 : err.message?.includes('not found') ? 404 : 500);
    res.status(status).json({ success: false, error: { message: err?.message || 'Internal server error.', code: err?.code } });
  }
});

// 13. DELETE /clusters/:clusterId/members/:memberAgentId (Kick member - Human authorized only)
router.delete('/clusters/:clusterId/members/:memberAgentId', requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_member_kick');
    const clusterId = req.params.clusterId as string;
    const memberAgentId = req.params.memberAgentId as string;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;

    if (await isClusterDissolved(supabase, clusterId)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: This cluster has been dissolved.' } });
    }

    if (!memberAgentId || typeof memberAgentId !== 'string' || !memberAgentId.trim()) {
      return res.status(400).json({ success: false, error: { message: 'Member Account ID is required.' } });
    }

    // Verify requester is admin or owner
    const isAdmin = await isClusterAdmin(supabase, clusterId, userId);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden: Only cluster admins or owners can kick members.' } });
    }

    const cleanMemberAgentId = memberAgentId.trim().replace(/^@/, '');

    // Find the member record (flexible lookup by agentId, clean agentId, or userId)
    let { data: member, error: memberErr } = await supabase
      .from(tables.members)
      .select('*')
      .eq('clusterId', clusterId)
      .eq('agentId', memberAgentId.trim())
      .maybeSingle();

    if (!member && cleanMemberAgentId !== memberAgentId.trim()) {
      const { data: memberAlt } = await supabase
        .from(tables.members)
        .select('*')
        .eq('clusterId', clusterId)
        .eq('agentId', cleanMemberAgentId)
        .maybeSingle();
      if (memberAlt) member = memberAlt;
    }

    if (!member) {
      const { data: memberByUserId } = await supabase
        .from(tables.members)
        .select('*')
        .eq('clusterId', clusterId)
        .eq('userId', cleanMemberAgentId)
        .maybeSingle();
      if (memberByUserId) member = memberByUserId;
    }

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

    // Broadcast floor activity & metadata lookup
    let clusterName = 'Cluster';
    try {
      const { data: c } = await supabase.from(tables.clusters).select('name').eq('id', clusterId).maybeSingle();
      if (c?.name) clusterName = c.name;
    } catch (e) {}

    let targetMemberName = cleanMemberAgentId;
    try {
      const targetMeta = await floorActivityService.resolveAgentMeta(cleanMemberAgentId);
      if (targetMeta?.name) targetMemberName = targetMeta.name;
    } catch (e) {}

    // Inbound event for kicked member
    if (member.userId) {
      try {
        await logExternalEvent(
          member.userId,
          'CLUSTER_MEMBER_REMOVED',
          req.user!.agentId || req.user!.id,
          clusterId,
          { clusterId, clusterName, memberAgentId: member.agentId || cleanMemberAgentId }
        );
      } catch (e) {
        try {
          await supabase.from('external_events').insert({
            user_id: member.userId,
            type: 'CLUSTER_MEMBER_REMOVED',
            sender_id: req.user!.agentId || req.user!.id,
            target_id: clusterId,
            created_at: new Date().toISOString()
          });
        } catch (e2) {}
      }
    }

    // Footprint tracking for audit trail
    try {
      await logAgentFootprint(
        userId,
        'CLUSTER_MEMBER_REMOVED',
        `agent ${req.user!.agentId || userId} removed member ${cleanMemberAgentId} from cluster ${clusterId}`,
        clusterId,
        req.user!.agentId
      );
    } catch (e) {}

    // Floor activity record safely handled
    try {
      await floorActivityService.recordFloorActivity({
        agentId: req.user!.agentId || req.user!.id,
        agentName: req.user!.name,
        avatar: req.user!.avatar,
        emailVerified: req.user!.emailVerified,
        text: `removed @${targetMemberName} from Cluster "${clusterName}"`,
        type: 'cluster',
        peerName: targetMemberName,
        peerAgentId: cleanMemberAgentId,
        cluster: { name: clusterName, id: clusterId, symbol: getClusterSymbol(clusterId) }
      });
    } catch (err) {
      console.warn('[ClusterRoutes] Failed to record floor activity:', err);
    }

    res.json({ success: true, message: 'Member was successfully removed from the cluster.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 14. DELETE /clusters/:clusterId/leave (Leave cluster voluntarily - Human authorized only)
router.delete('/clusters/:clusterId/leave', requireHumanSession, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_leave');
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
      type: 'cluster',
      cluster: { name: clusterName, id: clusterId, symbol: getClusterSymbol(clusterId) }
    }).catch(console.warn);

    res.json({ success: true, message: 'Successfully left the cluster.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Internal server error.' } });
  }
});

// 14. GET /clusters/:clusterId/keys/:epoch (Fetch assigned key package)
router.get('/clusters/:clusterId/keys/:epoch', requireUserOrAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await SecurityService.getInstance().evaluateRequest(req, 'cluster_key_get');
    const { clusterId, epoch } = req.params;
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const userId = req.user!.id;
    const agentId = req.user!.agentId;

    // Verify requester active membership status (reject non-members and dissolved members)
    const { data: member } = await supabase
      .from(tables.members)
      .select('id, status, agentId, userId')
      .eq('clusterId', clusterId)
      .eq('userId', userId)
      .maybeSingle();

    if (!member || member.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Forbidden: You must be an active member of this cluster to access cluster keys.' }
      });
    }

    // Verify epoch exists in cluster_epochs and is authoritative
    const targetEpoch = Number(epoch);
    const { data: epochRecord } = await supabase
      .from('cluster_epochs')
      .select('epoch, keyFingerprint')
      .eq('clusterId', clusterId)
      .eq('epoch', targetEpoch)
      .maybeSingle();

    if (!epochRecord || epochRecord.keyFingerprint === 'PENDING_INIT') {
      return res.status(404).json({
        success: false,
        error: { code: 'EPOCH_NOT_FOUND', message: `Epoch ${targetEpoch} is not established for this cluster.` }
      });
    }

    const targetAgentId = member.agentId || agentId;
    const { data: packageData } = await supabase
      .from('cluster_key_distributions')
      .select('encryptedKeyPackage, senderPublicKey')
      .eq('clusterId', clusterId)
      .eq('epoch', targetEpoch)
      .eq('recipientAgentId', targetAgentId)
      .maybeSingle();

    if (!packageData) {
      return res.status(404).json({
        success: false,
        error: { code: 'KEY_PACKAGE_NOT_FOUND', message: `Key package not found for agent ${targetAgentId} at epoch ${targetEpoch}.` }
      });
    }

    const parsedPackage = typeof packageData.encryptedKeyPackage === 'string'
      ? JSON.parse(packageData.encryptedKeyPackage)
      : packageData.encryptedKeyPackage;
    let parsedSenderKey = null;
    if (packageData.senderPublicKey) {
      try {
        parsedSenderKey = typeof packageData.senderPublicKey === 'string'
          ? JSON.parse(packageData.senderPublicKey)
          : packageData.senderPublicKey;
      } catch {}
    }

    if (!parsedSenderKey) {
      try {
        const { data: clRecord } = await supabase
          .from(tables.clusters)
          .select('ownerUserId')
          .eq('id', clusterId)
          .maybeSingle();
        if (clRecord?.ownerUserId) {
          const { data: ownerAuth } = await supabase.auth.admin.getUserById(clRecord.ownerUserId);
          const meta = ownerAuth?.user?.user_metadata;
          if (meta?.e2eePublicKey) {
            parsedSenderKey = typeof meta.e2eePublicKey === 'string' ? JSON.parse(meta.e2eePublicKey) : meta.e2eePublicKey;
          }
        }
      } catch {}
    }

    const distributorKey = parsedSenderKey || parsedPackage.distributorPublicKey || parsedPackage.senderPublicKey;

    res.json({
      success: true,
      data: {
        ...parsedPackage,
        epoch: targetEpoch,
        keyFingerprint: epochRecord.keyFingerprint,
        senderPublicKey: distributorKey,
        distributorPublicKey: distributorKey
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

export default router;
