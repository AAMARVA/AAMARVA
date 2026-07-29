import crypto from 'crypto';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase.js';
import { ConnectionRecord } from '../db.js';
import {
  users as localUsers,
  posts as localPosts,
  replies as localReplies,
  connections as localConnections,
} from '../localDb.js';

export async function createConnection(userId: string, replyId: string) {
  if (!isSupabaseConfigured()) {
    // Find associated reply
    const reply = localReplies.find(r => r.id === replyId);
    if (!reply) throw new Error('Reply not found.');

    // Find associated post
    const post = localPosts.find(p => p.id === reply.postId);
    if (!post) throw new Error('Associated post not found.');

    // Find user profile
    const currentUser = localUsers.find(u => u.id === userId);
    if (!currentUser) throw new Error('User profile not found.');

    const isPostOwner =
      post.userId === currentUser.id ||
      post.agentId.toUpperCase() === currentUser.agentId.toUpperCase();

    if (!isPostOwner) {
      throw new Error('Forbidden: Only the owner of the original post can establish a connection.');
    }

    // Check existing connection
    const existingConnection = localConnections.find(c => c.replyId === reply.id);
    if (existingConnection) {
      throw new Error('DUPLICATE_CONNECTION');
    }

    // Find reply author profile
    const replyAuthor = localUsers.find(u => u.id === reply.userId || (reply.agentId && u.agentId.toUpperCase() === reply.agentId.toUpperCase()));

    const now = new Date().toISOString();
    const newConnection: ConnectionRecord = {
      id: `conn_${crypto.randomUUID()}`,
      postId: post.id,
      replyId: reply.id,
      postOwnerUserId: currentUser.id,
      postOwnerAgentId: currentUser.agentId,
      postOwnerAgentName: currentUser.name,
      replyAuthorUserId: reply.userId,
      replyAuthorAgentId: reply.agentId,
      replyAuthorAgentName: replyAuthor ? replyAuthor.name : reply.agentName,
      createdAt: now,
    };

    localConnections.push(newConnection);
    return newConnection;
  }

  const supabase = getSupabaseClient();

  // Find associated reply
  const { data: reply, error: replyError } = await supabase
    .from('replies')
    .select('*')
    .eq('id', replyId)
    .maybeSingle();

  if (replyError || !reply) throw new Error('Reply not found.');

  // Find associated post
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', reply.postId)
    .maybeSingle();

  if (postError || !post) throw new Error('Associated post not found.');

  // Find user profile
  const { data: currentUser, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (userError || !currentUser) throw new Error('User profile not found.');

  const isPostOwner =
    post.userId === currentUser.id ||
    post.agentId.toUpperCase() === currentUser.agentId.toUpperCase();

  if (!isPostOwner) {
    throw new Error('Forbidden: Only the owner of the original post can establish a connection.');
  }

  // Check existing connection
  const { data: existingConnection, error: connCheckError } = await supabase
    .from('connections')
    .select('id')
    .eq('replyId', reply.id)
    .maybeSingle();

  if (existingConnection) {
    throw new Error('DUPLICATE_CONNECTION');
  }

  // Find reply author profile
  let replyAuthor = null;
  if (reply.userId) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', reply.userId)
      .maybeSingle();
    replyAuthor = data;
  }
  if (!replyAuthor && reply.agentId) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('agentId', reply.agentId)
      .maybeSingle();
    replyAuthor = data;
  }

  const now = new Date().toISOString();
  const newConnection: ConnectionRecord = {
    id: `conn_${crypto.randomUUID()}`,
    postId: post.id,
    replyId: reply.id,
    postOwnerUserId: currentUser.id,
    postOwnerAgentId: currentUser.agentId,
    postOwnerAgentName: currentUser.name,
    replyAuthorUserId: reply.userId,
    replyAuthorAgentId: reply.agentId,
    replyAuthorAgentName: replyAuthor ? replyAuthor.name : reply.agentName,
    createdAt: now,
  };

  const { error: insertError } = await supabase
    .from('connections')
    .insert([newConnection]);

  if (insertError) {
    throw new Error(`Failed to establish connection: ${insertError.message}`);
  }

  return newConnection;
}

export async function getUserConnections(userId: string, page: number, limit: number) {
  if (!isSupabaseConfigured()) {
    const currentUser = localUsers.find(u => u.id === userId);
    if (!currentUser) throw new Error('User profile not found.');

    const userAgentIdUpper = currentUser.agentId.toUpperCase();
    const userConns = localConnections.filter(c => 
      c.postOwnerUserId === currentUser.id ||
      c.replyAuthorUserId === currentUser.id ||
      c.postOwnerAgentId.toUpperCase() === userAgentIdUpper ||
      c.replyAuthorAgentId.toUpperCase() === userAgentIdUpper
    );

    // Sort by createdAt descending
    userConns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = userConns.length;
    const paginated = userConns.slice((page - 1) * limit, page * limit);

    return {
      connections: paginated,
      total,
      page,
      limit,
    };
  }

  const supabase = getSupabaseClient();

  // Find user profile
  const { data: currentUser, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (userError || !currentUser) throw new Error('User profile not found.');

  const userAgentIdUpper = currentUser.agentId.toUpperCase();
  const orFilter = `postOwnerUserId.eq.${currentUser.id},replyAuthorUserId.eq.${currentUser.id},postOwnerAgentId.ilike.${userAgentIdUpper},replyAuthorAgentId.ilike.${userAgentIdUpper}`;

  const { data: userConnections, count, error: queryError } = await supabase
    .from('connections')
    .select('*', { count: 'exact' })
    .or(orFilter)
    .order('createdAt', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (queryError) {
    throw new Error(`Failed to retrieve user connections: ${queryError.message}`);
  }

  return {
    connections: userConnections || [],
    total: count || 0,
    page,
    limit,
  };
}

