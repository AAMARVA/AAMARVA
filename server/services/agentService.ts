import { getSupabaseClient } from '../supabase.js';
import { UserRecord } from '../db.js';
import { normalizeUserRecord, DEFAULT_BIO } from '../authService.js';
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

  // 2. Fetch agent's posts (STRICT: only those authored by this account)
  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('*')
    .eq('userId', user.id)
    .order('createdAt', { ascending: false });

  // 3. Fetch agent's replies (STRICT: only those authored by this account)
  const { data: replies, error: repliesError } = await supabase
    .from('replies')
    .select('*')
    .eq('userId', user.id)
    .order('createdAt', { ascending: false });

  // 4. Fetch agent's connections (Any participation)
  let connections: any[] = [];
  const { data: connDataNew, error: connErrNew } = await supabase
    .from('connections')
    .select('*')
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
    .order('createdAt', { ascending: false });
  if (!connErrNew && connDataNew) {
    connections = connDataNew;
  }

  // 5. Fetch clusters where this agent's user or agentId is a member
  const tables = await getClusterTables(supabase);
  const { data: memberMemberships } = await supabase
    .from(tables.members)
    .select('clusterId, role, status, createdAt')
    .or(`userId.eq.${user.id},agentId.eq.${user.agentId},agentId.ilike.${user.agentId}`)
    .neq('status', 'dissolved');

  let formattedClusters: any[] = [];
  if (memberMemberships && memberMemberships.length > 0) {
    const clusterIds = memberMemberships.map((m: any) => m.clusterId);
    const { data: clusters } = await supabase
      .from(tables.clusters)
      .select('*')
      .in('id', clusterIds);

    const clusterMap = new Map();
    clusters?.forEach((c: any) => clusterMap.set(c.id, c));

    const ownerUserIds = new Set<string>();
    const ownerAgentIds = new Set<string>();
    clusters?.forEach((c: any) => {
      if (c.ownerUserId) ownerUserIds.add(c.ownerUserId);
      if (c.ownerAgentId) ownerAgentIds.add(c.ownerAgentId);
    });

    let allOwnerUsers: any[] = [];
    if (ownerUserIds.size > 0) {
      const { data } = await supabase.from('users').select('id, agentId, name, avatar, emailVerified').in('id', Array.from(ownerUserIds));
      if (data) allOwnerUsers = [...allOwnerUsers, ...data];
    }
    if (ownerAgentIds.size > 0) {
      const { data } = await supabase.from('users').select('id, agentId, name, avatar, emailVerified').in('agentId', Array.from(ownerAgentIds));
      if (data) allOwnerUsers = [...allOwnerUsers, ...data];
    }

    const ownerDataMap = new Map();
    allOwnerUsers.forEach((u: any) => {
      const uid = u.id;
      const aid = u.agentId || u.agent_id;
      if (uid) ownerDataMap.set(String(uid).toLowerCase(), u);
      if (aid) ownerDataMap.set(String(aid).toLowerCase(), u);
    });

    // Fetch member counts for active and total members across all clusters
    const { data: allClusterMembers } = await supabase
      .from(tables.members)
      .select('clusterId, status')
      .in('clusterId', clusterIds);

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
      const totalMembers = membersCountMap.get(cid) || 1;
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

  // Fetch avatars and names for connection participants
  let connectionsWithAvatars = [];
  if (connections && connections.length > 0) {
    const agentIds = new Set<string>();
    connections.forEach((c: any) => {
      const a1 = c.user1_agent_id || c.postOwnerAgentId;
      const a2 = c.user2_agent_id || c.replyAuthorAgentId;
      if (a1) agentIds.add(a1);
      if (a2) agentIds.add(a2);
    });

    const { data: users } = await supabase
      .from('users')
      .select('id, agentId, name, avatar, emailVerified')
      .in('agentId', Array.from(agentIds));
    
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

  // Fetch parent posts for replies
  const replyPostIds = Array.from(new Set((replies || []).map((r: any) => r.postId)));
  let parentPostsMap = new Map();
  if (replyPostIds.length > 0) {
    const { data: parentPosts } = await supabase
      .from('posts')
      .select('*')
      .in('id', replyPostIds);
    if (parentPosts) {
      parentPosts.forEach((p: any) => parentPostsMap.set(p.id, p));
    }
  }

  // Fetch counts for posts
  const postIds = (posts || []).map((p: any) => p.id);
  let postRepliesMap = new Map();
  let postConnectionsMap = new Map();
  if (postIds.length > 0) {
    const { data: allReplies } = await supabase.from('replies').select('postId').in('postId', postIds);
    allReplies?.forEach((r: any) => {
      postRepliesMap.set(r.postId, (postRepliesMap.get(r.postId) || 0) + 1);
    });
    const { data: allConns } = await supabase.from('connections').select('postId').in('postId', postIds);
    allConns?.forEach((c: any) => {
      postConnectionsMap.set(c.postId, (postConnectionsMap.get(c.postId) || 0) + 1);
    });
  }

  const userVerified = Boolean(user.emailVerified === true);
  const userStatus = userVerified ? 'verified' : 'not verified';

  // 1. Posts authored by this agent
  const formattedPosts = (posts || []).map((p: any) => {
    const pVerified = userVerified;
    const pStatus = pVerified ? 'verified' : 'not verified';
    const pName = p.agentName || user.name || 'Agent';
    return {
      id: p.id,
      postId: p.id,
      agentId: p.agentId || targetAgentId,
      name: pName,
      agentName: pName,
      avatar: p.avatar || user.avatar || '🤖',
      verificationStatus: pStatus,
      verification_status: pStatus,
      ["verification status"]: pStatus,
      emailVerified: pVerified,
      type: p.type || 'emit',
      category: p.category || 'General',
      content: p.content,
      repliesCount: postRepliesMap.get(p.id) || 0,
      connectionsCount: postConnectionsMap.get(p.id) || 0,
      createdAt: p.createdAt,
    };
  });

  // 2. Replies authored by this agent
  const formattedReplies = (replies || []).map((r: any) => {
    const rVerified = userVerified;
    const rStatus = rVerified ? 'verified' : 'not verified';
    const rName = r.agentName || user.name || 'Agent';
    const parent = parentPostsMap.get(r.postId);
    return {
      id: r.id,
      replyId: r.id,
      postId: r.postId,
      agentId: r.agentId || targetAgentId,
      name: rName,
      agentName: rName,
      avatar: r.avatar || user.avatar || '🤖',
      verificationStatus: rStatus,
      verification_status: rStatus,
      ["verification status"]: rStatus,
      emailVerified: rVerified,
      content: r.content,
      createdAt: r.createdAt,
      parentPost: parent ? {
        id: parent.id,
        postId: parent.id,
        agentId: parent.agentId,
        agentName: parent.agentName || 'Agent',
        avatar: parent.avatar || '🤖',
        content: parent.content,
        type: parent.type || 'emit',
        repliesCount: postRepliesMap.get(parent.id) || 0,
        connectionsCount: postConnectionsMap.get(parent.id) || 0,
        createdAt: parent.createdAt,
      } : null,
    };
  });

  // 3. Connections participated in by this agent
  const connIds = (connectionsWithAvatars || []).map((c: any) => c.id).filter(Boolean);
  let reviewsMap = new Map<string, { id: string; comment: string }>();
  if (connIds.length > 0) {
    try {
      const { data: revs } = await supabase
        .from('reviews')
        .select('id, connectionId, comment')
        .in('connectionId', connIds);
      if (revs) {
        revs.forEach((r: any) => {
          if (r.connectionId && !reviewsMap.has(r.connectionId)) {
            reviewsMap.set(r.connectionId, { id: r.id, comment: r.comment });
          }
        });
      }
    } catch (e) {
      console.warn('Failed to fetch reviews for connections:', e);
    }
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
    const counterUserId = isOwner ? u2Id : u1Id;
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

  // Calculate engagement stats
  const totalPosts = formattedPosts.length;
  const totalReplies = formattedReplies.length;
  const totalConnections = formattedConnections.length;

  let e2eePublicKeyFingerprint: string | null = null;
  let e2eeIdentityKey: string | null = null;
  let e2eePublicKey: string | null = null;
  let e2eeKeyEpoch: number = 1;
  try {
    const { data: authData } = await supabase.auth.admin.getUserById(user.id);
    if (authData?.user?.user_metadata) {
      e2eePublicKeyFingerprint = authData.user.user_metadata.e2eePublicKeyFingerprint || null;
      e2eeIdentityKey = authData.user.user_metadata.e2eeIdentityKey || null;
      e2eePublicKey = authData.user.user_metadata.e2eePublicKey || null;
      e2eeKeyEpoch = authData.user.user_metadata.e2eeKeyEpoch || 1;
    }
  } catch (e) {}

  const isSlaveAccount = Boolean(
    (rawUser.master_id && rawUser.master_id !== rawUser.id) ||
    (rawUser.masterUserId && rawUser.masterUserId !== rawUser.id) ||
    rawUser.account_type === 'slave' ||
    rawUser.role === 'slave' ||
    rawUser.is_slave === true ||
    rawUser.isSlave === true ||
    (rawUser.email && rawUser.email.includes('+AMR-'))
  );

  const capService = CapabilityService.getInstance();
  const hasCapabilityIncrement = isSlaveAccount
    ? (await capService.isAgentCapabilityActive(user.id) || await capService.isAgentCapabilityActive(targetAgentId))
    : false;

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
      plan_expires_at: (rawUser as any).plan_expires_at || null,
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
      posts: formattedPosts,
      replies: formattedReplies,
      connections: formattedConnections,
      clusters: formattedClusters,
      stats: {
        totalPosts,
        totalReplies,
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
    plan_expires_at: (rawUser as any).plan_expires_at || null,
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
    posts: formattedPosts,
    replies: formattedReplies,
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

  // 2. Fetch posts, replies, and connections for fleet activity aggregation
  const [postsRes, repliesRes, connectionsRes] = await Promise.all([
    supabase.from('posts').select('id, userId, agentId'),
    supabase.from('replies').select('id, userId, agentId, postId'),
    supabase.from('connections').select('id, user1_id, user2_id, user1_agent_id, user2_agent_id')
  ]);

  const allPosts = postsRes.data || [];
  const allReplies = repliesRes.data || [];
  const allConnections = connectionsRes.data || [];

  // Map activity counts per agent in the fleet
  const agents = fleetUsers.map((u: any) => {
    const isMaster = u.id === callerMasterId && (!u.master_id || u.is_master_primary === true);
    const uAgentIdUpper = (u.agentId || '').toUpperCase();

    const postCount = allPosts.filter((p: any) => 
      p.userId === u.id || (p.agentId && p.agentId.toUpperCase() === uAgentIdUpper)
    ).length;

    const replyCount = allReplies.filter((r: any) => 
      r.userId === u.id || (r.agentId && r.agentId.toUpperCase() === uAgentIdUpper)
    ).length;

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
      posts: postCount,
      connections: connectionCount,
      bids: replyCount,
      replies: replyCount,
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
      ? (await capService.isAgentCapabilityActive(u.id) || await capService.isAgentCapabilityActive(u.agentId))
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
