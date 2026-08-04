import crypto from 'crypto';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase.js';
import { ConnectionRecord } from '../db.js';

// In-memory messages fallback cache for when the Supabase 'messages' table is missing in the database
const inMemoryMessagesFallback: any[] = [];


export async function createConnection(userId: string, replyId: string) {
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

  // Automatically record the initial post and reply contents as messages for the connection chat
  const initialPostMessage = {
    id: `msg_post_${crypto.randomUUID()}`,
    connectionId: newConnection.id,
    senderUserId: newConnection.postOwnerUserId,
    senderAgentId: newConnection.postOwnerAgentId,
    content: post.content,
    createdAt: post.createdAt || now,
  };

  const initialReplyMessage = {
    id: `msg_reply_${crypto.randomUUID()}`,
    connectionId: newConnection.id,
    senderUserId: newConnection.replyAuthorUserId || newConnection.postOwnerUserId,
    senderAgentId: newConnection.replyAuthorAgentId,
    content: reply.content,
    createdAt: reply.createdAt || now,
  };

  inMemoryMessagesFallback.push(initialPostMessage);
  inMemoryMessagesFallback.push(initialReplyMessage);

  try {
    const { error: msgInsertError } = await supabase
      .from('messages')
      .insert([initialPostMessage, initialReplyMessage]);
    
    if (msgInsertError) {
      console.warn('⚠️ Messages table write during connection creation failed. Held in fallback.', msgInsertError.message);
    }
  } catch (err: any) {
    console.warn('⚠️ Messages table insert caught error. Held in fallback. Error:', err.message || err);
  }

  return newConnection;
}

export async function getUserConnections(userId: string, page: number, limit: number) {
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



export async function sendMessage(connectionId: string, userId: string, content: string) {
  const supabase = getSupabaseClient();
  
  // Find connection
  const { data: connection, error: connError } = await supabase
    .from('connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle();

  if (connError || !connection) throw new Error('Connection not found.');
  
  // Find user
  const { data: currentUser, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
    
  if (userError || !currentUser) throw new Error('User profile not found.');

  if (currentUser.id !== connection.postOwnerUserId && currentUser.id !== connection.replyAuthorUserId) {
    throw new Error('Forbidden: Not a participant of this connection.');
  }

  const now = new Date().toISOString();
  const newMessage = {
    id: `msg_${crypto.randomUUID()}`,
    connectionId,
    senderUserId: currentUser.id,
    senderAgentId: currentUser.agentId,
    content,
    createdAt: now,
  };

  // Always keep in-memory cache updated as a fallback
  inMemoryMessagesFallback.push(newMessage);

  // Try to insert (will fail if table doesn't exist, but we mock it if needed)
  try {
    const { error: insertError } = await supabase
      .from('messages')
      .insert([newMessage]);

    if (insertError) {
      console.warn('⚠️ Messages table write to Supabase failed (it might not exist). Message is held in memory fallback.', insertError.message);
    }
  } catch (err: any) {
    console.warn('⚠️ Exception caught during Messages table insert. Message is held in memory fallback. Error:', err.message || err);
  }

  return newMessage;
}

export async function getConnectionMessages(connectionId: string, userId: string) {
  const supabase = getSupabaseClient();
  
  const { data: connection, error: connError } = await supabase
    .from('connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle();

  if (connError || !connection) throw new Error('Connection not found.');
  
  // Check access
  if (connection.postOwnerUserId !== userId && connection.replyAuthorUserId !== userId) {
    throw new Error('Forbidden: Not a participant of this connection.');
  }

  let dbMessages: any[] = [];
  try {
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('connectionId', connectionId)
      .order('createdAt', { ascending: true });

    if (msgError) {
      console.warn("⚠️ Messages table query failed, falling back to in-memory store. Error:", msgError.message || msgError);
    } else {
      dbMessages = messages || [];
    }
  } catch (err: any) {
    console.warn("⚠️ Exception caught while querying messages table, falling back to in-memory store. Error:", err.message || err);
  }

  // To prevent duplicates if the table DOES exist but is partially synced, merge them gracefully
  const dbMsgIds = new Set(dbMessages.map(m => m.id));
  
  // Combine db messages with any temporary in-memory ones for this connection
  const combined = [...dbMessages];
  const memMsgs = inMemoryMessagesFallback.filter(m => m.connectionId === connectionId);
  memMsgs.forEach(m => {
    if (!dbMsgIds.has(m.id)) {
      combined.push(m);
    }
  });

  return combined.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
