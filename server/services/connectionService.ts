import crypto from 'crypto';
import { getSupabaseClient } from '../supabase.js';
import { ConnectionRecord } from '../db.js';

export async function createConnection(userId: string, replyId: string) {
  const supabase = getSupabaseClient();

  // Transactional RPC is the only connection creation path
  const { data: rpcData, error: rpcError } = await supabase.rpc('create_connection_from_reply', {
    p_user_id: userId,
    p_reply_id: replyId,
  });

  if (rpcError) {
    const msg = rpcError.message || '';
    const code = rpcError.code || '';

    // Specific domain errors
    if (msg.includes('DUPLICATE_CONNECTION') || code === '23505') {
      throw new Error('DUPLICATE_CONNECTION');
    }
    if (msg.includes('Reply not found')) {
      throw new Error('Reply not found.');
    }
    if (msg.includes('Associated post not found')) {
      throw new Error('Associated post not found.');
    }
    if (msg.includes('User profile not found')) {
      throw new Error('User profile not found.');
    }
    if (msg.includes('Forbidden: Only the owner')) {
      throw new Error('Forbidden: Only the owner of the original post can establish a connection.');
    }
    if (msg.includes('Forbidden: Post owner cannot establish')) {
      throw new Error('Forbidden: Post owner cannot establish a connection with their own reply.');
    }

    // Missing function detection (PGRST202 / 42883 / "Could not find the function")
    const isMissingFunction = code === 'PGRST202' || code === '42883' || msg.includes('Could not find the function');
    if (isMissingFunction) {
      console.error('[createConnection] Required database function create_connection_from_reply is missing or not deployed:', rpcError.message || rpcError);
      throw new Error('Failed to establish connection: Required database function is not available.');
    }

    console.error('[createConnection] Transaction error:', rpcError.message || rpcError);
    throw new Error('Failed to establish connection.');
  }

  if (!rpcData) {
    throw new Error('Failed to establish connection: No data returned.');
  }

  return rpcData as ConnectionRecord;
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

export const MAX_MESSAGE_CONTENT_LENGTH = 10000;

export async function sendMessage(connectionId: string, userId: string, content: string) {
  if (!content || typeof content !== 'string' || !content.trim()) {
    throw new Error('Message content is required.');
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length > MAX_MESSAGE_CONTENT_LENGTH) {
    throw new Error(`Message content exceeds the maximum limit of ${MAX_MESSAGE_CONTENT_LENGTH.toLocaleString()} characters.`);
  }

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
    content: trimmedContent,
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

  // Transactional RPC is the only connection acceptance path
  const { data: rpcData, error: rpcError } = await supabase.rpc('accept_connection_request', {
    p_user_id: userId,
    p_request_id: requestId,
  });

  if (rpcError) {
    const msg = rpcError.message || '';
    const code = rpcError.code || '';

    if (msg.includes('Connection request not found')) {
      throw new Error('Connection request not found.');
    }
    if (msg.includes('Forbidden: Not your connection request')) {
      throw new Error('Forbidden: Not your connection request.');
    }
    if (msg.includes('Connection request is no longer pending')) {
      throw new Error('Connection request is no longer pending.');
    }
    if (msg.includes('DUPLICATE_CONNECTION') || code === '23505') {
      const { data: existing } = await supabase
        .from('connections')
        .select('*')
        .eq('requestId', requestId)
        .maybeSingle();
      if (existing) return existing;
      throw new Error('DUPLICATE_CONNECTION');
    }

    const isMissingFunction = code === 'PGRST202' || code === '42883' || msg.includes('Could not find the function');
    if (isMissingFunction) {
      console.error('[acceptConnectionRequest] Required database function accept_connection_request is missing or not deployed:', rpcError.message || rpcError);
      throw new Error('Database error establishing connection: Required database function is not available.');
    }

    console.error('[acceptConnectionRequest] Transaction error:', rpcError.message || rpcError);
    throw new Error('Database error establishing connection.');
  }

  if (!rpcData) {
    throw new Error('Database error establishing connection: No data returned.');
  }

  return rpcData as ConnectionRecord;
}

export async function getRecentConnectionRequests(limit = 20) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('connection_requests')
    .select('*')
    .order('createdAt', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Database error querying connection requests: ${error.message}`);
  }

  return data || [];
}

export async function getRecentConnections(limit = 20) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .order('createdAt', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Database error querying recent connections: ${error.message}`);
  }

  return data || [];
}

export async function deleteConnectionRequest(requestId: string, userId: string) {
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

  // Verify participant access (either sender or receiver can delete/cancel/reject)
  if (request.senderUserId !== userId && request.receiverUserId !== userId) {
    throw new Error('Forbidden: Not your connection request.');
  }

  // Delete request
  const { error: deleteError } = await supabase
    .from('connection_requests')
    .delete()
    .eq('id', requestId);

  if (deleteError) {
    throw new Error(`Database error deleting connection request: ${deleteError.message}`);
  }

  return { success: true, message: 'Connection request deleted successfully.' };
}
