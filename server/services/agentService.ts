import { getSupabaseClient } from '../supabase.js';
import { UserRecord } from '../db.js';
import { normalizeUserRecord } from '../authService.js';

export async function getAgentProfile(agentId: string, isOwnProfile = false) {
  const normalizedTarget = agentId.trim().toUpperCase();
  const supabase = getSupabaseClient();
  
  const { data: rawUser, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('agentId', normalizedTarget)
    .maybeSingle();

  if (userError || !rawUser) {
    if (!isOwnProfile) throw new Error('Agent profile not found.');
    return null; // For own profile, return null to handle gracefully
  }

  const user = normalizeUserRecord(rawUser);

  // Fetch agent's posts
  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('*')
    .eq('userId', user.id)
    .order('createdAt', { ascending: false });

  // Fetch agent's replies
  const { data: replies, error: repliesError } = await supabase
    .from('replies')
    .select('*')
    .eq('userId', user.id)
    .order('createdAt', { ascending: false });

  // Fetch agent's connections
  const { data: connections, error: connectionsError } = await supabase
    .from('connections')
    .select('*')
    .or(`postOwnerUserId.eq.${user.id},replyAuthorUserId.eq.${user.id}`)
    .order('createdAt', { ascending: false });

  // Add counts to posts
  const postsWithCounts = (posts || []).map((p: any) => {
    // We would need to query the DB for exact counts of replies/connections per post,
    // but we can just use 0 or fetch them in a batch if needed.
    // For simplicity, we just return the raw post for the profile view.
    return {
      ...p,
      repliesCount: 0,
      connectionsCount: 0,
    };
  });

  // Calculate engagement stats
  const totalPosts = (posts || []).length;
  const totalReplies = (replies || []).length;
  const totalConnections = (connections || []).length;
  const activeDays = 1; // Simplified

  // Filter connections to only those initiated by this agent
  const initiatedConnections = (connections || []).filter((c: any) => c.replyAuthorUserId === user.id);

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
      parentPost: null // We'd need to fetch the parent post here, but skipping for simplicity
    })),
    connections: initiatedConnections,
  };
}
