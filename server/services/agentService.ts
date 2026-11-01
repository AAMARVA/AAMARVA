import { getSupabaseClient } from '../supabase.js';
import { UserRecord } from '../db.js';
import { normalizeUserRecord, DEFAULT_BIO, getAuthUserForRecord } from '../authService.js';
import { getClusterTables } from '../routes/clusterRoutes.js';
import { getClusterSymbol } from '../lib/clusterSymbols.js';
import { CapabilityService } from './capabilityService.js';

export async function getAgentProfile(agentId: string, isOwnProfile = false, callerMasterId?: string | null) {
  const trimmed = agentId.trim();
  const normalizedTarget = trimmed.replace(/^@/, '');
  const supabase = getSupabaseClient();
  
  // 1. Fetch user record first to get canonical identity (check agentId, name, or UUID id)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  const orConditions = [
    `agentId.ilike.${normalizedTarget}`,
    `agentId.eq.${normalizedTarget}`,
    `name.ilike.${normalizedTarget}`,
    isUUID ? `id.eq.${trimmed}` : null
  ].filter(Boolean).join(',');

  const { data: rawUser, error: userError } = await supabase
    .from('users')
    .select('id, agentId, email, name, status, avatar, bio, createdAt, emailVerified, master_id, is_master_primary')
    .or(orConditions)
    .maybeSingle();

  if (userError || !rawUser) {
    if (!isOwnProfile) throw new Error('Agent profile not found.');
    return null;
  }

  // Fleet Isolation Guard:
  // If not own profile, enforce that caller belongs to the same master fleet as the target agent.
  if (!isOwnProfile) {
    const targetMasterId = (rawUser.master_id && !rawUser.is_master_primary)
      ? rawUser.master_id
      : rawUser.id;

    if (!callerMasterId || targetMasterId !== callerMasterId) {
      throw new Error('Agent profile not found.');
    }
  }

  const user = normalizeUserRecord(rawUser);
  const targetAgentId = user.agentId; // Use canonical agentId from user record
  const tables = await getClusterTables(supabase);

  const isSlaveAccount = Boolean(
    (rawUser.master_id && rawUser.master_id !== rawUser.id) ||
    ((rawUser as any).masterUserId && (rawUser as any).masterUserId !== rawUser.id) ||
    (rawUser as any).account_type === 'slave' ||
    (rawUser as any).role === 'slave' ||
    (rawUser as any).is_slave === true ||
    (rawUser as any).isSlave === true ||
    (rawUser.email && rawUser.email.includes('+AMR-'))
  );

  const capService = CapabilityService.getInstance();

  // Wave 1: Parallelize connections, cluster memberships, auth metadata, and capability lookup
  const [
    { data: connDataNew, error: connErrNew },
    { data: memberMemberships },
    authUserRecord,
    capabilityInfo
  ] = await Promise.all([
    supabase
      .from('connections')
      .select('*')
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order('createdAt', { ascending: false }),
    supabase
      .from(tables.members)
      .select('clusterId, role, status, createdAt')
      .or(`userId.eq.${user.id},agentId.eq.${user.agentId},agentId.ilike.${user.agentId}`)
      .neq('status', 'dissolved'),
    getAuthUserForRecord(supabase, user).catch(() => null),
    isSlaveAccount
      ? (async () => {
          const [capById, capByAgentId] = await Promise.all([
            capService.getAgentCapability(user.id),
            capService.getAgentCapability(targetAgentId)
          ]);
          const cap = capById || capByAgentId;
          const expiresAt = cap?.expires_at || (rawUser as any).plan_expires_at || (rawUser as any).expires_at || null;
          let hasCapabilityIncrement = Boolean(
            (rawUser as any).hasCapabilityIncrement ||
            (rawUser as any).plan === 'slave_capability' ||
            (expiresAt && new Date(expiresAt).getTime() > Date.now())
          );
          if (!hasCapabilityIncrement) {
            const [activeById, activeByAgentId] = await Promise.all([
              capService.isAgentCapabilityActive(user.id),
              capService.isAgentCapabilityActive(targetAgentId)
            ]);
            hasCapabilityIncrement = Boolean(activeById || activeByAgentId);
          }
          return { expiresAt, hasCapabilityIncrement };
        })()
      : Promise.resolve({
          expiresAt: (rawUser as any).plan_expires_at || (rawUser as any).expires_at || null,
          hasCapabilityIncrement: false
        })
  ]);

  const connections: any[] = (!connErrNew && connDataNew) ? connDataNew : [];
  const clusterIds = (memberMemberships && memberMemberships.length > 0)
    ? memberMemberships.map((m: any) => m.clusterId)
    : [];

  const connectionAgentIds = new Set<string>();
  connections.forEach((c: any) => {
    const a1 = c.user1_agent_id || c.postOwnerAgentId;
    const a2 = c.user2_agent_id || c.replyAuthorAgentId;
    if (a1) connectionAgentIds.add(a1);
    if (a2) connectionAgentIds.add(a2);
  });
  const connIds = connections.map((c: any) => c.id).filter(Boolean);

  // Wave 2: Parallelize secondary enrichment queries across clusters and connections
  const [
    clustersRes,
    allClusterMembersRes,
    connectionUsersRes,
    reviewsRes
  ] = await Promise.all([
    clusterIds.length > 0
      ? supabase.from(tables.clusters).select('*').in('id', clusterIds)
      : Promise.resolve({ data: null }),
    clusterIds.length > 0
      ? supabase.from(tables.members).select('clusterId, status').in('clusterId', clusterIds)
      : Promise.resolve({ data: null }),
    connectionAgentIds.size > 0
      ? supabase.from('users').select('id, agentId, name, avatar, emailVerified').in('agentId', Array.from(connectionAgentIds))
      : Promise.resolve({ data: null }),
    connIds.length > 0
      ? Promise.resolve(supabase.from('reviews').select('id, connectionId, comment').in('connectionId', connIds)).catch(() => ({ data: null }))
      : Promise.resolve({ data: null })
  ]);

  let formattedClusters: any[] = [];
  if (memberMemberships && memberMemberships.length > 0) {
    const clusters = clustersRes.data;
    const allClusterMembers = allClusterMembersRes.data;

    const clusterMap = new Map();
    clusters?.forEach((c: any) => clusterMap.set(c.id, c));

    const ownerUserIds = new Set<string>();
    const ownerAgentIds = new Set<string>();
    clusters?.forEach((c: any) => {
      if (c.ownerUserId) ownerUserIds.add(c.ownerUserId);
      if (c.ownerAgentId) ownerAgentIds.add(c.ownerAgentId);
    });

    const [ownerByIdsRes, ownerByAgentIdsRes] = await Promise.all([
      ownerUserIds.size > 0
        ? supabase.from('users').select('id, agentId, name, avatar, emailVerified').in('id', Array.from(ownerUserIds))
        : Promise.resolve({ data: null }),
      ownerAgentIds.size > 0
        ? supabase.from('users').select('id, agentId, name, avatar, emailVerified').in('agentId', Array.from(ownerAgentIds))
        : Promise.resolve({ data: null })
    ]);

    const allOwnerUsers: any[] = [
      ...(ownerByIdsRes.data || []),
      ...(ownerByAgentIdsRes.data || [])
    ];

    const ownerDataMap = new Map();
    allOwnerUsers.forEach((u: any) => {
      const uid = u.id;
      const aid = u.agentId || u.agent_id;
      if (uid) ownerDataMap.set(String(uid).toLowerCase(), u);
      if (aid) ownerDataMap.set(String(aid).toLowerCase(), u);
    });

    const membersCountMap = new Map<string, number>();
    const activeMembersCountMap = new Map<string, number>();

    allClusterMembers?.forEach((m: any) => {
      const cid = m.clusterId;
      if (cid) {
        membersCountMap.set(cid, (membersCountMap.get(cid) || 0) + 1);
        const isMemberActive = m.status ? m.status !== 'dissolved' : true;
        if (isMemberActive) {
          activeMembersCountMap.set(cid, (activeMembersCountMap.get(cid) || 0) + 1);
        }
      }
    });

    formattedClusters = memberMemberships.map((m: any) => {
      const cluster = clusterMap.get(m.clusterId);
      const ownerUid = cluster?.ownerUserId;
      const ownerAid = cluster?.ownerAgentId;
      
      const ownerInfo = (ownerUid ? ownerDataMap.get(String(ownerUid).toLowerCase()) : null) || 
                        (ownerAid ? ownerDataMap.get(String(ownerAid).toLowerCase()) : null);

      const ownerAgentId = ownerInfo?.agentId || ownerAid || null;
      const ownerAgentName = (ownerInfo?.name && String(ownerInfo.name).trim()) || ownerAgentId || 'Unknown Agent';
      const ownerAgentAvatar = ownerInfo?.avatar || '';
      const ownerVerificationStatus = ownerInfo?.emailVerified ? 'verified' : 'not verified';

      const cid = m.clusterId;
      const activeMembers = activeMembersCountMap.get(cid) || (m.status !== 'dissolved' ? 1 : 0);

      const isMemberDissolved = m.status === 'dissolved';
      const isClusterDissolved = cluster?.status === 'dissolved';
      const effectiveStatus = (isMemberDissolved || isClusterDissolved) ? 'dissolved' : 'active';

      return {
        id: m.clusterId,
        clusterId: m.clusterId,
        name: cluster?.name || 'Cluster',
        description: cluster?.description || '',
        founderAgentId: ownerAgentId,
        founderAgentName: ownerAgentName,
        founderAgentAvatar: ownerAgentAvatar,
        founderVerificationStatus: ownerVerificationStatus,
        ownerAgentId: ownerAgentId,
        ownerAgentName: ownerAgentName,
        ownerAgentAvatar: ownerAgentAvatar,
        ownerVerificationStatus: ownerVerificationStatus,
        verificationStatus: ownerVerificationStatus,
        activeMembersCount: activeMembers,
        role: m.role || 'member',
        status: effectiveStatus,
        membershipStatus: m.status || 'active',
        createdAt: m.createdAt || cluster?.createdAt || new Date().toISOString(),
      };
    });
  }

  // Format connection participants
  let connectionsWithAvatars: any[] = [];
  if (connections && connections.length > 0) {
    const users = connectionUsersRes.data;
    const userMap = new Map();
    users?.forEach((u: any) => userMap.set(u.agentId.toUpperCase(), u));

    connectionsWithAvatars = connections.map((c: any) => {
      const a1 = c.user1_agent_id || c.postOwnerAgentId || '';
      const a2 = c.user2_agent_id || c.replyAuthorAgentId || '';
      const u1 = c.user1_id || c.postOwnerUserId;
      const u2 = c.user2_id || c.replyAuthorUserId;
      const ownerUser = userMap.get(a1.toUpperCase());
      const replyUser = userMap.get(a2.toUpperCase());
      const poVStatus = ownerUser?.emailVerified ? 'verified' : 'not verified';
      const raVStatus = replyUser?.emailVerified ? 'verified' : 'not verified';

      return {
        ...c,
        connectionStatus: c.status || 'active',
        user1_id: ownerUser?.id || u1,
        user2_id: replyUser?.id || u2,
        user1_agent_id: a1,
        user2_agent_id: a2,
        user1_agent_name: ownerUser?.name || c.user1_agent_name || c.postOwnerAgentName || 'Agent',
        user2_agent_name: replyUser?.name || c.user2_agent_name || c.replyAuthorAgentName || 'Agent',
        postOwnerAgentName: ownerUser?.name || c.user1_agent_name || c.postOwnerAgentName || 'Agent',
        replyAuthorAgentName: replyUser?.name || c.user2_agent_name || c.replyAuthorAgentName || 'Agent',
        postOwnerAvatar: ownerUser?.avatar || '🤖',
        replyAuthorAvatar: replyUser?.avatar || '🤖',
        postOwnerEmailVerified: ownerUser?.emailVerified,
        replyAuthorEmailVerified: replyUser?.emailVerified,
        postOwnerVerificationStatus: poVStatus,
        replyAuthorVerificationStatus: raVStatus,
        postOwnerUserId: ownerUser?.id || u1,
        replyAuthorUserId: replyUser?.id || u2,
      };
    });
  }

  const userVerified = Boolean(user.emailVerified === true);
  const userStatus = userVerified ? 'verified' : 'not verified';

  // Connections participated in by this agent
  const reviewsMap = new Map<string, { id: string; comment: string }>();
  if (reviewsRes.data) {
    reviewsRes.data.forEach((r: any) => {
      if (r.connectionId && !reviewsMap.has(r.connectionId)) {
        reviewsMap.set(r.connectionId, { id: r.id, comment: r.comment });
      }
    });
  }

  const formattedConnections = (connectionsWithAvatars || []).map((c: any) => {
    const rev = reviewsMap.get(c.id);
    const u1Id = c.user1_id || c.postOwnerUserId;
    const u2Id = c.user2_id || c.replyAuthorUserId;
    const a1Id = c.user1_agent_id || c.postOwnerAgentId;
    const a2Id = c.user2_agent_id || c.replyAuthorAgentId;
    const a1Name = c.user1_agent_name || c.postOwnerAgentName || 'Agent';
    const a2Name = c.user2_agent_name || c.replyAuthorAgentName || 'Agent';

    const isOwner = (u1Id === user.id) || (a1Id?.toUpperCase() === targetAgentId.toUpperCase());
    const counterAgentId = isOwner ? a2Id : a1Id;
    const counterName = isOwner ? (a2Name || c.replyAuthorAgentName || 'Agent') : (a1Name || c.postOwnerAgentName || 'Agent');
    const counterAvatar = isOwner ? c.replyAuthorAvatar : c.postOwnerAvatar;
    const counterEmailVerified = isOwner ? c.replyAuthorEmailVerified : c.postOwnerEmailVerified;
    const counterVerified = Boolean(counterEmailVerified === true);
    const counterStatus = counterVerified ? 'verified' : 'not verified';

    const poVStatus = c.postOwnerVerificationStatus || (c.postOwnerEmailVerified ? 'verified' : 'not verified');
    const raVStatus = c.replyAuthorVerificationStatus || (c.replyAuthorEmailVerified ? 'verified' : 'not verified');

    return {
      id: c.id,
      connectionId: c.id,
      reviewId: rev?.id || null,
      content: rev?.comment || null,
      agentId: counterAgentId,
      name: counterName,
      agentName: counterName,
      avatar: counterAvatar || '🤖',
      verificationStatus: counterStatus,
      verification_status: counterStatus,
      ["verification status"]: counterStatus,
      emailVerified: counterVerified,
      status: c.status || 'active',
      connectionStatus: c.status || 'active',
      createdAt: c.createdAt || c.created_at || new Date().toISOString(),
      user1_id: u1Id,
      user2_id: u2Id,
      user1_agent_id: a1Id,
      user2_agent_id: a2Id,
      user1_agent_name: a1Name,
      user2_agent_name: a2Name,
      postOwnerAgentId: a1Id,
      postOwnerAgentName: a1Name,
      postOwnerVerificationStatus: poVStatus,
      replyAuthorAgentId: a2Id,
      replyAuthorAgentName: a2Name,
      replyAuthorVerificationStatus: raVStatus,
      postOwnerAvatar: c.postOwnerAvatar,
      replyAuthorAvatar: c.replyAuthorAvatar,
    };
  });

  // Calculate fleet stats
  const totalConnections = formattedConnections.length;

  let e2eePublicKeyFingerprint: string | null = null;
  let e2eeIdentityKey: string | null = null;
  let e2eePublicKey: string | null = null;
  let e2eeKeyEpoch: number = 1;
  if (authUserRecord?.user_metadata) {
    e2eePublicKeyFingerprint = authUserRecord.user_metadata.e2eePublicKeyFingerprint || null;
    e2eeIdentityKey = authUserRecord.user_metadata.e2eeIdentityKey || null;
    e2eePublicKey = authUserRecord.user_metadata.e2eePublicKey || null;
    e2eeKeyEpoch = authUserRecord.user_metadata.e2eeKeyEpoch || 1;
  }

  const expiresAt = capabilityInfo.expiresAt;
  const hasCapabilityIncrement = capabilityInfo.hasCapabilityIncrement;

  if (isOwnProfile) {
    return {
      id: user.id,
      userId: user.id,
      email: user.email,
      emailVerified: user.emailVerified === true,
      agentId: targetAgentId,
      accountId: targetAgentId,
      verificationStatus: userStatus,
      name: user.name,
      bio: user.bio || DEFAULT_BIO,
      avatar: user.avatar || '🤖',
      createdAt: user.createdAt,
      plan_created_at: (rawUser as any).plan_created_at || null,
      plan_expires_at: expiresAt,
      expires_at: expiresAt,
      capability_expires_at: expiresAt,
      isMasterUser: !isSlaveAccount,
      is_master_primary: !isSlaveAccount,
      isMasterPrimary: !isSlaveAccount,
      account_type: isSlaveAccount ? 'slave' : 'master',
      role: isSlaveAccount ? 'slave' : (user.role || 'agent'),
      is_slave: isSlaveAccount,
      isSlave: isSlaveAccount,
      hasCapabilityIncrement,
      master_id: rawUser.master_id || null,
      masterUserId: rawUser.master_id || null,
      e2eePublicKey,
      e2eePublicKeyFingerprint,
      e2eeIdentityKey,
      e2eeKeyEpoch,
      connections: formattedConnections,
      clusters: formattedClusters,
      stats: {
        totalConnections,
        totalClusters: formattedClusters.length,
      },
    };
  }

  return {
    id: user.id,
    userId: user.id,
    agentId: targetAgentId,
    accountId: targetAgentId,
    verificationStatus: userStatus,
    emailVerified: userVerified,
    name: user.name,
    bio: user.bio || DEFAULT_BIO,
    avatar: user.avatar || '🤖',
    createdAt: user.createdAt,
    plan_created_at: (rawUser as any).plan_created_at || null,
    plan_expires_at: expiresAt,
    expires_at: expiresAt,
    capability_expires_at: expiresAt,
    isMasterUser: !isSlaveAccount,
    is_master_primary: !isSlaveAccount,
    isMasterPrimary: !isSlaveAccount,
    account_type: isSlaveAccount ? 'slave' : 'master',
    role: isSlaveAccount ? 'slave' : (user.role || 'agent'),
    is_slave: isSlaveAccount,
    isSlave: isSlaveAccount,
    hasCapabilityIncrement,
    e2eePublicKeyFingerprint,
    e2eeIdentityKey,
    connections: formattedConnections,
    clusters: formattedClusters,
  };
}

export async function getAgentActivityStats(callerMasterId?: string | null) {
  if (!callerMasterId) {
    return {
      agents: [],
      clusters: []
    };
  }

  const supabase = getSupabaseClient();

  // 1. Fetch all accounts in caller's master fleet (master + all slaves)
  const { data: rawUsers, error: usersError } = await supabase
    .from('users')
    .select('id, agentId, name, avatar, emailVerified, master_id, is_master_primary, createdAt');

  if (usersError) {
    throw new Error(`Failed to query fleet users for telemetry: ${usersError.message}`);
  }

  const fleetUsers = (rawUsers || []).filter((u: any) => {
    return u.master_id === callerMasterId || u.id === callerMasterId;
  });

  if (fleetUsers.length === 0) {
    return {
      agents: [],
      clusters: []
    };
  }

  const fleetUserIds = fleetUsers.map((u: any) => u.id).filter(Boolean);
  const fleetAgentIds = fleetUsers.map((u: any) => u.agentId).filter(Boolean);
  const fleetAgentIdUpperSet = new Set(fleetAgentIds.map((a: string) => a.toUpperCase()));
  const fleetUserIdSet = new Set(fleetUserIds);

  // 2. Fetch connections for fleet activity aggregation
  const connectionsRes = await supabase
    .from('connections')
    .select('id, user1_id, user2_id, user1_agent_id, user2_agent_id');

  const allConnections = connectionsRes.data || [];

  // Map activity counts per agent in the fleet
  const agents = fleetUsers.map((u: any) => {
    const isMaster = u.id === callerMasterId && (!u.master_id || u.is_master_primary === true);
    const uAgentIdUpper = (u.agentId || '').toUpperCase();

    const connectionCount = allConnections.filter((c: any) => 
      c.user1_id === u.id ||
      c.user2_id === u.id ||
      (c.user1_agent_id && c.user1_agent_id.toUpperCase() === uAgentIdUpper) ||
      (c.user2_agent_id && c.user2_agent_id.toUpperCase() === uAgentIdUpper)
    ).length;

    const isVerified = Boolean(u.emailVerified === true);
    const vStatus = isVerified ? 'verified' : 'not verified';

    return {
      id: u.id,
      agentId: u.agentId || u.id,
      name: u.name || u.agentId || 'Agent Node',
      avatar: u.avatar || '🤖',
      emailVerified: isVerified,
      verificationStatus: vStatus,
      verification_status: vStatus,
      ["verification status"]: vStatus,
      role: isMaster ? 'master' : 'slave',
      isMaster,
      isSlave: !isMaster,
      connections: connectionCount,
      createdAt: u.createdAt || new Date().toISOString()
    };
  });

  // 3. Fetch clusters belonging to caller's fleet
  let clusters: any[] = [];
  try {
    const tables = await getClusterTables(supabase);
    
    // Fetch members and clusters
    const [allMembersRes, allClustersRes] = await Promise.all([
      supabase.from(tables.members).select('id, clusterId, userId, agentId, role, status'),
      supabase.from(tables.clusters).select('*').neq('status', 'dissolved')
    ]);

    const allMembers = allMembersRes.data || [];
    const activeClusters = allClustersRes.data || [];

    // Find clusters where a fleet member is an active member or owner
    const fleetClusterIds = new Set<string>();

    allMembers.forEach((m: any) => {
      if (m.status !== 'dissolved' && m.clusterId) {
        if (fleetUserIdSet.has(m.userId) || (m.agentId && fleetAgentIdUpperSet.has(m.agentId.toUpperCase()))) {
          fleetClusterIds.add(m.clusterId);
        }
      }
    });

    activeClusters.forEach((c: any) => {
      if (c.id && c.status !== 'dissolved') {
        if (fleetUserIdSet.has(c.ownerUserId) || (c.ownerAgentId && fleetAgentIdUpperSet.has(c.ownerAgentId.toUpperCase()))) {
          fleetClusterIds.add(c.id);
        }
      }
    });

    if (fleetClusterIds.size > 0) {
      const activeMemberCountMap = new Map<string, number>();
      allMembers.forEach((m: any) => {
        if (m.clusterId && m.status !== 'dissolved') {
          activeMemberCountMap.set(m.clusterId, (activeMemberCountMap.get(m.clusterId) || 0) + 1);
        }
      });

      const userMap = new Map();
      fleetUsers.forEach((u: any) => {
        if (u.id) userMap.set(u.id.toLowerCase(), u);
        if (u.agentId) userMap.set(u.agentId.toLowerCase(), u);
      });

      clusters = activeClusters
        .filter((c: any) => fleetClusterIds.has(c.id))
        .map((c: any) => {
          const ownerInfo = userMap.get((c.ownerUserId || '').toLowerCase()) || userMap.get((c.ownerAgentId || '').toLowerCase());
          const activeCount = activeMemberCountMap.get(c.id) || 1;
          const symbol = c.symbol || getClusterSymbol(c.id);

          return {
            id: c.id,
            clusterId: c.id,
            name: c.name || 'Cluster',
            description: c.description || '',
            symbol,
            ownerAgentId: c.ownerAgentId,
            ownerAgentName: ownerInfo?.name || c.ownerAgentId || 'Agent',
            ownerAgentAvatar: ownerInfo?.avatar || '',
            activeMembersCount: activeCount,
            memberCount: activeCount,
            status: 'active',
            createdAt: c.createdAt || c.created_at || new Date().toISOString()
          };
        });
    }
  } catch (clusterErr) {
    console.warn('Failed to fetch telemetry cluster stats:', clusterErr);
  }

  return {
    agents,
    clusters
  };
}

export async function getAgents(query: string = '', page: number = 1, limit: number = 20, callerMasterId?: string | null) {
  const safePage = Math.max(1, parseInt(String(page)) || 1);
  const safeLimit = Math.max(1, Math.min(parseInt(String(limit)) || 20, 100));

  // Default to denying private fleet discovery for unauthenticated callers
  if (!callerMasterId) {
    return {
      agents: [],
      total: 0,
      page: safePage,
      limit: safeLimit,
    };
  }

  const supabase = getSupabaseClient();

  let queryBuilder = supabase
    .from('users')
    .select('id, agentId, name, avatar, bio, createdAt, emailVerified, master_id, is_master_primary', { count: 'exact' })
    .or(`master_id.eq.${callerMasterId},id.eq.${callerMasterId}`);

  if (query && query.trim()) {
    const cleanQuery = query.replace(/[,()"\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanQuery) {
      queryBuilder = queryBuilder.or(`name.ilike.%${cleanQuery}%,agentId.ilike.%${cleanQuery}%,bio.ilike.%${cleanQuery}%`);
    }
  }

  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  const { data, error } = await queryBuilder
    .order('createdAt', { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`Database error querying agents: ${error.message}`);
  }

  // Strict in-memory fleet isolation guard: only include accounts that belong to this master's fleet.
  // Returns both the Master account and all associated Slave accounts in the current fleet.
  const fleetAgents = (data || []).filter((u: any) => {
    return u.master_id === callerMasterId || u.id === callerMasterId;
  });

  const agents = await Promise.all(fleetAgents.map(async (u: any) => {
    const isVerified = Boolean(u.emailVerified === true);
    const vStatus = isVerified ? 'verified' : 'not verified';
    const isMaster = (u.id === callerMasterId && (!u.master_id || u.is_master_primary === true)) || u.account_type === 'master' || u.is_master_primary === true;
    
    const capService = CapabilityService.getInstance();
    const hasCapabilityIncrement = !isMaster
      ? Boolean(
          u.hasCapabilityIncrement ||
          u.plan === 'slave_capability' ||
          (u.plan_expires_at && new Date(u.plan_expires_at).getTime() > Date.now()) ||
          await capService.isAgentCapabilityActive(u.id) || 
          await capService.isAgentCapabilityActive(u.agentId)
        )
      : false;

    return {
      id: u.id,
      agentId: u.agentId || u.id,
      verificationStatus: vStatus,
      verification_status: vStatus,
      ["verification status"]: vStatus,
      name: u.name,
      avatar: u.avatar || '🤖',
      bio: u.bio || '',
      createdAt: u.createdAt || new Date().toISOString(),
      emailVerified: isVerified,
      role: isMaster ? 'master' : 'slave',
      isMaster,
      isSlave: !isMaster,
      masterId: u.master_id || (isMaster ? u.id : null),
      hasCapabilityIncrement
    };
  }));

  return {
    agents,
    total: fleetAgents.length,
    page: safePage,
    limit: safeLimit,
  };
}
