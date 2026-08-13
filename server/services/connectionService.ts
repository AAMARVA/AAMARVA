import crypto from 'crypto';
import { getSupabaseClient } from '../supabase.js';
import { ConnectionRecord } from '../db.js';

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

  // Ensure post owner cannot connect to their own reply
  const isSelfReply =
    (post.userId && reply.userId && post.userId === reply.userId) ||
    (post.agentId && reply.agentId && post.agentId.toUpperCase() === reply.agentId.toUpperCase());

  if (isSelfReply) {
    throw new Error('Forbidden: Post owner cannot establish a connection with their own reply.');
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

  const { error: msgInsertError } = await supabase
    .from('messages')
    .insert([initialPostMessage, initialReplyMessage]);
  
  if (msgInsertError) {
    throw new Error(`Database error writing connection initial messages: ${msgInsertError.message}`);
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

  const connections = userConnections || [];
  const total = count || 0;

  if (connections.length === 0) {
    return {
      connections: [],
      total,
      page,
      limit,
    };
  }

  // Fetch unique agent IDs to get avatars
  const agentIds = new Set<string>();
  connections.forEach((c: any) => {
    if (c.postOwnerAgentId) agentIds.add(c.postOwnerAgentId.toUpperCase());
    if (c.replyAuthorAgentId) agentIds.add(c.replyAuthorAgentId.toUpperCase());
  });

  let users: any[] = [];
  if (agentIds.size > 0) {
    const { data: userData } = await supabase
      .from('users')
      .select('agentId, name, avatar')
      .in('agentId', Array.from(agentIds));
    users = userData || [];
  }

  const mappedConnections = connections.map((c: any) => {
    const replyAuthor = users.find(u => u.agentId.toUpperCase() === c.replyAuthorAgentId.toUpperCase());
    const postOwner = users.find(u => u.agentId.toUpperCase() === c.postOwnerAgentId.toUpperCase());

    const isUserPostOwner = c.postOwnerUserId === userId;
    
    const peerName = isUserPostOwner 
      ? (c.replyAuthorAgentName || replyAuthor?.name || 'Guest Agent')
      : (c.postOwnerAgentName || postOwner?.name || 'Host Agent');
      
    const peerAgentId = isUserPostOwner ? c.replyAuthorAgentId : c.postOwnerAgentId;
    const peerAvatar = isUserPostOwner ? (replyAuthor?.avatar || '🤖') : (postOwner?.avatar || '🤖');

    return {
      id: c.id,
      postId: c.postId,
      replyId: c.replyId,
      agentName: peerName,
      agentId: peerAgentId,
      avatar: peerAvatar,
      isHost: isUserPostOwner,
      postOwnerAgentName: c.postOwnerAgentName || postOwner?.name || 'Host Agent',
      postOwnerAgentId: c.postOwnerAgentId,
      postOwnerAvatar: postOwner?.avatar || '🤖',
      replyAuthorAgentName: c.replyAuthorAgentName || replyAuthor?.name,
      replyAuthorAgentId: c.replyAuthorAgentId,
      replyAuthorAvatar: replyAuthor?.avatar || '🤖',
      createdAt: c.createdAt,
    };
  });

  return {
    connections: mappedConnections,
    total,
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

  const { error: insertError } = await supabase
    .from('messages')
    .insert([newMessage]);

  if (insertError) {
    throw new Error(`Database error sending message: ${insertError.message}`);
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

  // Verify participant access
  const { data: currentUser } = await supabase
    .from('users')
    .select('agentId')
    .eq('id', userId)
    .maybeSingle();

  const currentAgentId = currentUser?.agentId;
  const isParticipant =
    connection.postOwnerUserId === userId ||
    connection.replyAuthorUserId === userId ||
    (currentAgentId && (
      (connection.postOwnerAgentId && connection.postOwnerAgentId.toLowerCase() === currentAgentId.toLowerCase()) ||
      (connection.replyAuthorAgentId && connection.replyAuthorAgentId.toLowerCase() === currentAgentId.toLowerCase())
    ));

  if (!isParticipant) {
    throw new Error('Forbidden: You are not a participant in this conversation.');
  }

  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('*')
    .eq('connectionId', connectionId)
    .order('createdAt', { ascending: true });

  if (msgError) {
    throw new Error(`Database error querying messages: ${msgError.message}`);
  }

  const combined = messages || [];

  return combined.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function deleteConnection(connectionId: string, userId: string) {
  const supabase = getSupabaseClient();

  const { data: connection, error: connError } = await supabase
    .from('connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle();

  if (connError || !connection) {
    throw new Error('Connection not found.');
  }

  // Verify participant access
  const { data: currentUser } = await supabase
    .from('users')
    .select('agentId')
    .eq('id', userId)
    .maybeSingle();

  const currentAgentId = currentUser?.agentId;
  const isParticipant =
    connection.postOwnerUserId === userId ||
    connection.replyAuthorUserId === userId ||
    (currentAgentId && (
      (connection.postOwnerAgentId && connection.postOwnerAgentId.toLowerCase() === currentAgentId.toLowerCase()) ||
      (connection.replyAuthorAgentId && connection.replyAuthorAgentId.toLowerCase() === currentAgentId.toLowerCase())
    ));

  if (!isParticipant) {
    throw new Error('Forbidden: You are not a participant in this connection.');
  }

  // Delete messages associated with connection
  await supabase.from('messages').delete().eq('connectionId', connectionId);

  // Delete connection record
  const { error: deleteError } = await supabase
    .from('connections')
    .delete()
    .eq('id', connectionId);

  if (deleteError) {
    throw new Error(`Failed to delete connection: ${deleteError.message}`);
  }

  return { success: true, message: 'Connection removed successfully.' };
}

export async function sendConnectionRequest(senderUserId: string, receiverAgentId: string) {
  const supabase = getSupabaseClient();

  // Find sender profile
  const { data: sender, error: senderError } = await supabase
    .from('users')
    .select('*')
    .eq('id', senderUserId)
    .maybeSingle();
  if (senderError || !sender) throw new Error('Sender profile not found.');

  // Find receiver profile
  const { data: receiver, error: receiverError } = await supabase
    .from('users')
    .select('*')
    .eq('agentId', receiverAgentId)
    .maybeSingle();
  if (receiverError || !receiver) throw new Error('Target agent not found.');

  if (sender.id === receiver.id) {
    throw new Error('Cannot send connection request to yourself.');
  }

  // Check if already connected
  const orFilter = `and(postOwnerUserId.eq.${sender.id},replyAuthorUserId.eq.${receiver.id}),and(postOwnerUserId.eq.${receiver.id},replyAuthorUserId.eq.${sender.id})`;
  const { data: existingConn } = await supabase
    .from('connections')
    .select('id')
    .or(orFilter)
    .maybeSingle();
  
  if (existingConn) {
    throw new Error('Already connected to this agent.');
  }

  // Check if request already pending
  const { data: existingRequest } = await supabase
    .from('connection_requests')
    .select('id')
    .match({ senderUserId, receiverUserId: receiver.id, status: 'pending' })
    .maybeSingle();

  if (existingRequest) {
    throw new Error('Connection request already pending.');
  }

  const newRequest = {
    id: `req_${crypto.randomUUID()}`,
    senderUserId,
    senderAgentId: sender.agentId,
    senderAgentName: sender.name,
    receiverUserId: receiver.id,
    receiverAgentId: receiver.agentId,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  const { error: insertError } = await supabase
    .from('connection_requests')
    .insert([newRequest]);

  if (insertError) {
    throw new Error(`Database error creating connection request: ${insertError.message}`);
  }

  const { status, ...rest } = newRequest;
  return rest;
}

export async function getConnectionRequests(userId: string) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('connection_requests')
    .select('*')
    .eq('receiverUserId', userId)
    .eq('status', 'pending')
    .order('createdAt', { ascending: false });

  if (error) {
    throw new Error(`Database error querying connection requests: ${error.message}`);
  }

  const combined = data || [];

  return combined
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(({ status, ...rest }) => rest);
}

export async function acceptConnectionRequest(requestId: string, userId: string) {
  const supabase = getSupabaseClient();

  // Find request
  const { data: request, error: reqError } = await supabase
    .from('connection_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  
  if (reqError || !request) {
    throw new Error('Connection request not found.');
  }

  if (request.receiverUserId !== userId) throw new Error('Forbidden: Not your connection request.');
  if (request.status !== 'pending') throw new Error('Connection request is no longer pending.');

  // Update request status
  const { error: updateError } = await supabase
    .from('connection_requests')
    .update({ status: 'accepted' })
    .eq('id', requestId);

  if (updateError) {
    throw new Error(`Database error updating connection request status: ${updateError.message}`);
  }

  // Create connection
  const now = new Date().toISOString();
  const newConnection: ConnectionRecord = {
    id: `conn_${crypto.randomUUID()}`,
    postId: '', // Direct connection, no post
    replyId: '', // Direct connection, no reply
    postOwnerUserId: request.senderUserId,
    postOwnerAgentId: request.senderAgentId,
    postOwnerAgentName: request.senderAgentName,
    replyAuthorUserId: request.receiverUserId,
    replyAuthorAgentId: request.receiverAgentId,
    replyAuthorAgentName: '',
    createdAt: now,
  };

  // Get receiver name
  const { data: receiver } = await supabase
    .from('users')
    .select('name')
    .eq('id', userId)
    .maybeSingle();
  newConnection.replyAuthorAgentName = receiver?.name || 'Agent';

  const { error: connError } = await supabase
    .from('connections')
    .insert([newConnection]);

  if (connError) {
    throw new Error(`Database error establishing connection: ${connError.message}`);
  }

  return newConnection;
}
