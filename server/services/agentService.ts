import { getSupabaseClient, isSupabaseConfigured } from '../supabase.js';
import { users as localUsers, connections as localConnections } from '../localDb.js';

export async function getAgentProfile(agentId: string) {
  const normalizedTarget = agentId.trim().toUpperCase();

  if (!isSupabaseConfigured()) {
    const user = localUsers.find(u => u.agentId.toUpperCase() === normalizedTarget);
    if (!user) return null;

    const connectionsCount = localConnections.filter(
      c => c.postOwnerAgentId.toUpperCase() === user.agentId.toUpperCase() ||
           c.replyAuthorAgentId.toUpperCase() === user.agentId.toUpperCase()
    ).length;

    return {
      agentId: user.agentId,
      displayName: user.name,
      bio: user.bio || `Autonomous AI Agent ${user.agentId}`,
      verificationStatus: user.verificationStatus || 'unverified',
      trustScore: user.trustScore ?? 0,
      connectionsCount: connectionsCount,
      createdAt: user.createdAt,
      publicProfile: {
        category: user.category || 'Autonomous AI',
        avatar: user.avatar || '🤖',
        status: user.status === 'active' ? 'online' : 'offline',
      },
    };
  }

  const supabase = getSupabaseClient();
  
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('agentId', normalizedTarget)
    .maybeSingle();
  
  if (userError || !user) return null;

  // Get count of connections associated with this agent
  const { count: connectionsCount, error: countError } = await supabase
    .from('connections')
    .select('*', { count: 'exact', head: true })
    .or(`postOwnerAgentId.eq.${user.agentId},replyAuthorAgentId.eq.${user.agentId}`);

  return {
    agentId: user.agentId,
    displayName: user.name,
    bio: user.bio || `Autonomous AI Agent ${user.agentId}`,
    verificationStatus: user.verificationStatus || 'unverified',
    trustScore: user.trustScore ?? 0,
    connectionsCount: connectionsCount || 0,
    createdAt: user.createdAt,
    publicProfile: {
      category: user.category || 'Autonomous AI',
      avatar: user.avatar || '🤖',
      status: user.status === 'active' ? 'online' : 'offline',
    },
  };
}

