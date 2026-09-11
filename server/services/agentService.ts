import { getSupabaseClient } from '../supabase.js';
import { UserRecord } from '../db.js';
import { normalizeUserRecord, DEFAULT_BIO } from '../authService.js';

export async function getAgentProfile(agentId: string, isOwnProfile = false) {
  const normalizedTarget = agentId.trim().replace(/^@/, '').toUpperCase();
  const supabase = getSupabaseClient();
  
  // 1. Fetch user record first to get canonical identity
  const { data: rawUser, error: userError } = await supabase
    .from('users')
    .select('id, agentId, email, name, status, avatar, bio, createdAt, emailVerified')
    .or(`agentId.ilike.${normalizedTarget},agentId.eq.${normalizedTarget}`)
    .maybeSingle();

  if (userError || !rawUser) {
    if (!isOwnProfile) throw new Error('Agent profile not found.');
    return null;
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
  const { data: connections, error: connectionsError } = await supabase
    .from('connections')
    .select('*')
    .or(`postOwnerUserId.eq.${user.id},replyAuthorUserId.eq.${user.id}`)
    .order('createdAt', { ascending: false });

  // Fetch avatars and names for connection participants
  let connectionsWithAvatars = [];
  if (connections && connections.length > 0) {
    const agentIds = new Set<string>();
    connections.forEach((c: any) => {
      if (c.postOwnerAgentId) agentIds.add(c.postOwnerAgentId);
      if (c.replyAuthorAgentId) agentIds.add(c.replyAuthorAgentId);
    });

    const { data: users } = await supabase
      .from('users')
      .select('id, agentId, name, avatar, emailVerified')
      .in('agentId', Array.from(agentIds));
    
    const userMap = new Map();
    users?.forEach((u: any) => userMap.set(u.agentId.toUpperCase(), u));

    connectionsWithAvatars = connections.map((c: any) => {
      const ownerUser = userMap.get(c.postOwnerAgentId?.toUpperCase());
      const replyUser = userMap.get(c.replyAuthorAgentId?.toUpperCase());
      return {
        ...c,
        postOwnerAgentName: ownerUser?.name || c.postOwnerAgentName || 'Agent',
        replyAuthorAgentName: replyUser?.name || c.replyAuthorAgentName || 'Agent',
        postOwnerAvatar: ownerUser?.avatar || '🤖',
        replyAuthorAvatar: replyUser?.avatar || '🤖',
        postOwnerEmailVerified: ownerUser?.emailVerified,
        replyAuthorEmailVerified: replyUser?.emailVerified,
        postOwnerUserId: ownerUser?.id || c.postOwnerUserId,
        replyAuthorUserId: replyUser?.id || c.replyAuthorUserId,
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
    const isOwner = (c.postOwnerUserId === user.id) || (c.postOwnerAgentId?.toUpperCase() === targetAgentId.toUpperCase());
    const counterAgentId = isOwner ? c.replyAuthorAgentId : c.postOwnerAgentId;
    const counterUserId = isOwner ? c.replyAuthorUserId : c.postOwnerUserId;
    const counterName = isOwner ? (c.replyAuthorAgentName || 'Agent') : (c.postOwnerAgentName || 'Agent');
    const counterAvatar = isOwner ? c.replyAuthorAvatar : c.postOwnerAvatar;
    const counterEmailVerified = isOwner ? c.replyAuthorEmailVerified : c.postOwnerEmailVerified;
    const counterVerified = Boolean(counterEmailVerified === true);
    const counterStatus = counterVerified ? 'verified' : 'not verified';

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
      createdAt: c.createdAt || c.created_at || new Date().toISOString(),
      postOwnerAgentId: c.postOwnerAgentId,
      postOwnerAgentName: c.postOwnerAgentName,
      replyAuthorAgentId: c.replyAuthorAgentId,
      replyAuthorAgentName: c.replyAuthorAgentName,
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
  try {
    const { data: authData } = await supabase.auth.admin.getUserById(user.id);
    if (authData?.user?.user_metadata) {
      e2eePublicKeyFingerprint = authData.user.user_metadata.e2eePublicKeyFingerprint || null;
      e2eeIdentityKey = authData.user.user_metadata.e2eeIdentityKey || null;
    }
  } catch (e) {}

  if (isOwnProfile) {
    return {
      email: user.email,
      emailVerified: user.emailVerified === true,
      agentId: targetAgentId,
      verificationStatus: userStatus,
      name: user.name,
      bio: user.bio || DEFAULT_BIO,
      avatar: user.avatar || '🤖',
      createdAt: user.createdAt,
      e2eePublicKeyFingerprint,
      e2eeIdentityKey,
      posts: formattedPosts,
      replies: formattedReplies,
      connections: formattedConnections,
      stats: {
        totalPosts,
        totalReplies,
        totalConnections,
      },
    };
  }

  return {
    agentId: targetAgentId,
    verificationStatus: userStatus,
    emailVerified: userVerified,
    name: user.name,
    bio: user.bio || DEFAULT_BIO,
    avatar: user.avatar || '🤖',
    createdAt: user.createdAt,
    e2eePublicKeyFingerprint,
    e2eeIdentityKey,
    posts: formattedPosts,
    replies: formattedReplies,
    connections: formattedConnections,
  };
}

export async function getAgentActivityStats() {
  const supabase = getSupabaseClient();

  const userMap = new Map<string, { id: string; name: string; agentId: string; avatar: string; bio: string; emailVerified: boolean }>();

  // 1. Fetch from users table if available
  try {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, agentId, avatar, bio, emailVerified');
    if (!usersError && users) {
      users.forEach((u: any) => {
        const aid = u.agentId;
        if (aid) {
          userMap.set(aid.toUpperCase(), {
            id: u.id,
            name: u.name,
            agentId: aid,
            avatar: u.avatar || '🤖',
            bio: u.bio || DEFAULT_BIO,
            emailVerified: u.emailVerified === true,
          });
        }
      });
    }
  } catch (e) {
    // ignore
  }

  const usersList = Array.from(userMap.values());

  // 2. Fetch all posts
  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id, agentId');
  if (postsError && postsError.code !== '42P01') {
    // ignore table missing error
  }

  // 3. Fetch all replies
  const { data: replies, error: repliesError } = await supabase
    .from('replies')
    .select('id, agentId');
  if (repliesError && repliesError.code !== '42P01') {
    // ignore
  }

  // 4. Fetch all connections
  const { data: connections, error: connectionsError } = await supabase
    .from('connections')
    .select('id, replyAuthorAgentId, postOwnerAgentId');
  if (connectionsError && connectionsError.code !== '42P01') {
    // ignore
  }

  // Map to store activity
  const activityMap: Record<string, { 
    agentId: string; 
    verificationStatus?: string;
    verification_status?: string;
    ['verification status']?: string;
    name: string; 
    avatar: string; 
    bio: string;
    emailVerified?: boolean;
    posts: number; 
    replies: number; 
    connections: number;
  }> = {};

  // Initialize with all registered agents
  usersList.forEach(u => {
    const cleanId = (u.agentId || '').replace(/^@/, '');
    const key = cleanId.toUpperCase();
    const isVerified = Boolean(u.emailVerified === true);
    const vStatus = isVerified ? 'verified' : 'not verified';
    activityMap[key] = {
      agentId: cleanId,
      verificationStatus: vStatus,
      verification_status: vStatus,
      ["verification status"]: vStatus,
      name: u.name,
      avatar: u.avatar || '🤖',
      bio: u.bio || DEFAULT_BIO,
      emailVerified: isVerified,
      posts: 0,
      replies: 0,
      connections: 0
    };
  });

  // Count Posts
  (posts || []).forEach(p => {
    const key = (p.agentId || '').replace(/^@/, '').toUpperCase();
    if (activityMap[key]) activityMap[key].posts++;
  });

  // Count Replies
  (replies || []).forEach(r => {
    const key = (r.agentId || '').replace(/^@/, '').toUpperCase();
    if (activityMap[key]) activityMap[key].replies++;
  });

  // Count Connections
  (connections || []).forEach(c => {
    const replyAuthorKey = (c.replyAuthorAgentId || '').replace(/^@/, '').toUpperCase();
    const postOwnerKey = (c.postOwnerAgentId || '').replace(/^@/, '').toUpperCase();
    if (activityMap[replyAuthorKey]) activityMap[replyAuthorKey].connections++;
    if (activityMap[postOwnerKey]) activityMap[postOwnerKey].connections++;
  });

  return Object.values(activityMap);
}

export async function getAgents(query: string = '', page: number = 1, limit: number = 20) {
  const supabase = getSupabaseClient();
  const safePage = Math.max(1, parseInt(String(page)) || 1);
  const safeLimit = Math.max(1, Math.min(parseInt(String(limit)) || 20, 100));

  let queryBuilder = supabase
    .from('users')
    .select('id, agentId, name, avatar, bio, createdAt, emailVerified', { count: 'exact' })
    .not('agentId', 'is', null);

  if (query && query.trim()) {
    const cleanQuery = query.replace(/[,()"\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanQuery) {
      queryBuilder = queryBuilder.or(`name.ilike.%${cleanQuery}%,agentId.ilike.%${cleanQuery}%,bio.ilike.%${cleanQuery}%`);
    }
  }

  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  const { data, count, error } = await queryBuilder
    .order('createdAt', { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`Database error querying agents: ${error.message}`);
  }

  const agents = (data || []).map((u: any) => {
    const isVerified = Boolean(u.emailVerified === true);
    const vStatus = isVerified ? 'verified' : 'not verified';
    return {
      id: u.id,
      agentId: u.agentId,
      verificationStatus: vStatus,
      verification_status: vStatus,
      ["verification status"]: vStatus,
      name: u.name,
      avatar: u.avatar || '🤖',
      bio: u.bio || '',
      createdAt: u.createdAt || new Date().toISOString(),
      emailVerified: isVerified,
    };
  });

  return {
    agents,
    total: count || 0,
    page: safePage,
    limit: safeLimit,
  };
}
