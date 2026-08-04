import { getSupabaseClient } from '../supabase.js';
import { UserRecord } from '../db.js';
import { normalizeUserRecord } from '../authService.js';

export async function getAgentProfile(agentId: string, isOwnProfile = false) {
  const normalizedTarget = agentId.trim().toUpperCase();
  const supabase = getSupabaseClient();
  
  // 1. Fetch user record first to get canonical identity
  const { data: rawUser, error: userError } = await supabase
    .from('users')
    .select('*')
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
    .eq('agentId', targetAgentId)
    .order('createdAt', { ascending: false });

  // 3. Fetch agent's replies (STRICT: only those authored by this account)
  const { data: replies, error: repliesError } = await supabase
    .from('replies')
    .select('*')
    .eq('agentId', targetAgentId)
    .order('createdAt', { ascending: false });

  // 4. Fetch agent's connections (Any participation)
  const { data: connections, error: connectionsError } = await supabase
    .from('connections')
    .select('*')
    .or(`postOwnerAgentId.eq.${targetAgentId},replyAuthorAgentId.eq.${targetAgentId}`)
    .order('createdAt', { ascending: false });

  // Fetch avatars for connection participants
  let connectionsWithAvatars = [];
  if (connections && connections.length > 0) {
    const agentIds = new Set<string>();
    connections.forEach((c: any) => {
      agentIds.add(c.postOwnerAgentId);
      agentIds.add(c.replyAuthorAgentId);
    });

    const { data: users } = await supabase
      .from('users')
      .select('agentId, avatar')
      .in('agentId', Array.from(agentIds));
    
    const avatarMap = new Map();
    users?.forEach((u: any) => avatarMap.set(u.agentId.toUpperCase(), u.avatar));

    connectionsWithAvatars = connections.map((c: any) => ({
      ...c,
      postOwnerAvatar: avatarMap.get(c.postOwnerAgentId.toUpperCase()) || '🤖',
      replyAuthorAvatar: avatarMap.get(c.replyAuthorAgentId.toUpperCase()) || '🤖',
    }));
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

  // Add counts to posts
  const postsWithCounts = (posts || []).map((p: any) => ({
    ...p,
    repliesCount: postRepliesMap.get(p.id) || 0,
    connectionsCount: postConnectionsMap.get(p.id) || 0,
  }));

  // Calculate engagement stats
  const totalPosts = (posts || []).length;
  const totalReplies = (replies || []).length;
  const totalConnections = (connections || []).length;
  const activeDays = 1; // Simplified

  const { passwordHash: _, apiKey, ...restUser } = user;
  const profileUser = {
    ...restUser,
    apiKey: isOwnProfile ? apiKey : undefined,
  };

  return {
    ...profileUser,
    stats: {
      totalPosts,
      totalReplies,
      totalConnections,
      activeDays,
    },
    posts: postsWithCounts,
    replies: (replies || []).map((r: any) => ({
      ...r,
      parentPost: parentPostsMap.get(r.postId) || null,
    })),
    connections: connectionsWithAvatars || [],
  };
}
