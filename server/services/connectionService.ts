import crypto from 'crypto';
import { getSupabaseClient } from '../supabase.js';
import { ConnectionRecord } from '../db.js';

export class ConnectionError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = 'CONNECTION_ERROR') {
    super(message);
    this.name = 'ConnectionError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

export class ConnectionConflictError extends ConnectionError {
  constructor(message: string, code = 'CONNECTION_CONFLICT') {
    super(message, 409, code);
    this.name = 'ConnectionConflictError';
  }
}

export class ConnectionNotFoundError extends ConnectionError {
  constructor(message: string, code = 'CONNECTION_NOT_FOUND') {
    super(message, 404, code);
    this.name = 'ConnectionNotFoundError';
  }
}

export class ConnectionForbiddenError extends ConnectionError {
  constructor(message: string, code = 'FORBIDDEN') {
    super(message, 403, code);
    this.name = 'ConnectionForbiddenError';
  }
}

export class ConnectionCapabilityError extends ConnectionError {
  constructor(message = 'Failed to establish connection: Required database transactional procedure is unavailable.', code = 'DATABASE_CAPABILITY_UNAVAILABLE') {
    super(message, 503, code);
    this.name = 'ConnectionCapabilityError';
  }
}

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
      throw new ConnectionConflictError('Duplicate connection detected.', 'DUPLICATE_CONNECTION');
    }
    if (msg.includes('Reply not found')) {
      throw new ConnectionNotFoundError('Reply not found.', 'REPLY_NOT_FOUND');
    }
    if (msg.includes('Associated post not found')) {
      throw new ConnectionNotFoundError('Associated post not found.', 'POST_NOT_FOUND');
    }
    if (msg.includes('User profile not found')) {
      throw new ConnectionNotFoundError('User profile not found.', 'USER_NOT_FOUND');
    }
    if (msg.includes('Forbidden: Only the owner')) {
      throw new ConnectionForbiddenError('Forbidden: Only the owner of the original post can establish a connection.', 'FORBIDDEN');
    }
    if (msg.includes('Forbidden: Post owner cannot establish')) {
      throw new ConnectionForbiddenError('Forbidden: Post owner cannot establish a connection with their own reply.', 'FORBIDDEN');
    }

    // Missing function or capability error (PGRST202 / 42883 / "Could not find the function")
    const isMissingFunction = code === 'PGRST202' || code === '42883' || msg.includes('Could not find the function') || msg.includes('operator does not exist');
    if (isMissingFunction) {
      console.error('[createConnection] Required database function create_connection_from_reply is missing or not deployed:', rpcError.message || rpcError);
      throw new ConnectionCapabilityError('Failed to establish connection: Required database function is not available.');
    }

    console.error('[createConnection] Transaction error:', rpcError.message || rpcError);
    throw new ConnectionError('Failed to establish connection.', 500, 'DATABASE_ERROR');
  }

  if (!rpcData) {
    throw new ConnectionError('Failed to establish connection: No data returned.', 500, 'DATABASE_ERROR');
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

  if (userError || !currentUser) {
    throw new ConnectionNotFoundError('User profile not found.', 'USER_NOT_FOUND');
  }

  const userAgentIdUpper = currentUser.agentId.toUpperCase();
  const orFilter = `postOwnerUserId.eq.${currentUser.id},replyAuthorUserId.eq.${currentUser.id},postOwnerAgentId.ilike.${userAgentIdUpper},replyAuthorAgentId.ilike.${userAgentIdUpper}`;

  const { data: userConnections, count, error: queryError } = await supabase
    .from('connections')
    .select('*', { count: 'exact' })
    .or(orFilter)
    .order('createdAt', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (queryError) {
    throw new ConnectionError(`Failed to retrieve user connections: ${queryError.message}`, 500, 'DATABASE_ERROR');
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
      .select('id, agentId, name, avatar, emailVerified')
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
    const peerUserId = isUserPostOwner ? (c.replyAuthorUserId || replyAuthor?.id) : (c.postOwnerUserId || postOwner?.id);
    const peerEmailVerified = isUserPostOwner 
      ? Boolean(replyAuthor?.emailVerified === true)
      : Boolean(postOwner?.emailVerified === true);
    const peerStatus = peerEmailVerified ? 'verified' : 'not verified';

    const poVerified = Boolean(postOwner?.emailVerified === true);
    const poStatus = poVerified ? 'verified' : 'not verified';

    const raVerified = Boolean(replyAuthor?.emailVerified === true);
    const raStatus = raVerified ? 'verified' : 'not verified';

    return {
      id: c.id,
      postId: c.postId,
      replyId: c.replyId,
      agentName: peerName,
      agentId: peerAgentId,
      verificationStatus: peerStatus,
      verification_status: peerStatus,
      ["verification status"]: peerStatus,
      avatar: peerAvatar,
      emailVerified: peerEmailVerified,
      isHost: isUserPostOwner,
      postOwnerAgentName: c.postOwnerAgentName || postOwner?.name || 'Host Agent',
      postOwnerAgentId: c.postOwnerAgentId,
      postOwnerVerificationStatus: poStatus,
      postOwnerAvatar: postOwner?.avatar || '🤖',
      postOwnerEmailVerified: poVerified,
      replyAuthorAgentName: c.replyAuthorAgentName || replyAuthor?.name,
      replyAuthorAgentId: c.replyAuthorAgentId,
      replyAuthorVerificationStatus: raStatus,
      replyAuthorAvatar: replyAuthor?.avatar || '🤖',
      replyAuthorEmailVerified: raVerified,
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
    throw new ConnectionError('Message content is required.', 400, 'MISSING_CONTENT');
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length > MAX_MESSAGE_CONTENT_LENGTH) {
    throw new ConnectionError(`Message content exceeds the maximum limit of ${MAX_MESSAGE_CONTENT_LENGTH.toLocaleString()} characters.`, 400, 'CONTENT_TOO_LONG');
  }

  const supabase = getSupabaseClient();
  
  // Find connection
  const { data: connection, error: connError } = await supabase
    .from('connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle();

  if (connError || !connection) {
    throw new ConnectionNotFoundError('Connection not found.', 'CONNECTION_NOT_FOUND');
  }
  
  // Find user
  const { data: currentUser, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
    
  if (userError || !currentUser) {
    throw new ConnectionNotFoundError('User profile not found.', 'USER_NOT_FOUND');
  }

  if (currentUser.id !== connection.postOwnerUserId && currentUser.id !== connection.replyAuthorUserId) {
    throw new ConnectionForbiddenError('Forbidden: Not a participant of this connection.', 'FORBIDDEN');
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
    throw new ConnectionError(`Database error sending message: ${insertError.message}`, 500, 'DATABASE_ERROR');
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

  if (connError || !connection) {
    throw new ConnectionNotFoundError('Connection not found.', 'CONNECTION_NOT_FOUND');
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
    throw new ConnectionForbiddenError('Forbidden: You are not a participant in this conversation.', 'FORBIDDEN');
  }

  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('*')
    .eq('connectionId', connectionId)
    .order('createdAt', { ascending: true });

  if (msgError) {
    throw new ConnectionError(`Database error querying messages: ${msgError.message}`, 500, 'DATABASE_ERROR');
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
    throw new ConnectionNotFoundError('Connection not found.', 'CONNECTION_NOT_FOUND');
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
    throw new ConnectionForbiddenError('Forbidden: You are not a participant in this connection.', 'FORBIDDEN');
  }

  // Delete messages associated with connection
  await supabase.from('messages').delete().eq('connectionId', connectionId);

  // Delete connection record
  const { error: deleteError } = await supabase
    .from('connections')
    .delete()
    .eq('id', connectionId);

  if (deleteError) {
    throw new ConnectionError(`Failed to delete connection: ${deleteError.message}`, 500, 'DATABASE_ERROR');
  }

  return { success: true, message: 'Connection removed successfully.' };
}

const inFlightRequestLocks = new Map<string, Promise<any>>();

export async function sendConnectionRequest(senderUserId: string, receiverAgentId: string) {
  const cleanAgentId = (receiverAgentId || '').trim().toUpperCase();
  const pairKey = `${senderUserId}:${cleanAgentId}`;

  while (inFlightRequestLocks.has(pairKey)) {
    const activeLock = inFlightRequestLocks.get(pairKey);
    if (activeLock) {
      await activeLock.catch(() => {});
    }
  }

  let releaseLock: () => void = () => {};
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  inFlightRequestLocks.set(pairKey, lockPromise);

  try {
    const supabase = getSupabaseClient();

    // Find sender profile
    const { data: sender, error: senderError } = await supabase
      .from('users')
      .select('*')
      .eq('id', senderUserId)
      .maybeSingle();
    if (senderError || !sender) {
      throw new ConnectionNotFoundError('Sender profile not found.', 'SENDER_NOT_FOUND');
    }

    // Find receiver profile
    const { data: receiver, error: receiverError } = await supabase
      .from('users')
      .select('*')
      .eq('agentId', cleanAgentId)
      .maybeSingle();
    if (receiverError || !receiver) {
      throw new ConnectionNotFoundError('Target agent not found.', 'TARGET_AGENT_NOT_FOUND');
    }

    if (sender.id === receiver.id) {
      throw new ConnectionError('Cannot send connection request to yourself.', 400, 'SELF_CONNECTION_FORBIDDEN');
    }

    // Check if already connected (undirected check: both directions)
    const [connFwd, connRev] = await Promise.all([
      supabase.from('connections').select('id').eq('postOwnerUserId', sender.id).eq('replyAuthorUserId', receiver.id).maybeSingle(),
      supabase.from('connections').select('id').eq('postOwnerUserId', receiver.id).eq('replyAuthorUserId', sender.id).maybeSingle()
    ]);
    const existingConn = connFwd.data || connRev.data;
    
    if (existingConn) {
      throw new ConnectionConflictError('Already connected to this agent.', 'ALREADY_CONNECTED');
    }

    // Check if request already pending
    const { data: existingRequest } = await supabase
      .from('connection_requests')
      .select('id')
      .match({ senderUserId, receiverUserId: receiver.id, status: 'pending' })
      .maybeSingle();

    if (existingRequest) {
      throw new ConnectionConflictError('Connection request already pending.', 'CONNECTION_REQUEST_ALREADY_EXISTS');
    }

    const requestId = `req_${crypto.randomUUID()}`;
    const newRequest = {
      id: requestId,
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
      const msg = insertError.message || '';
      const code = insertError.code || '';
      if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
        console.warn(`[sendConnectionRequest] Conflict detected for pending request from ${senderUserId} to ${receiver.id}:`, insertError.message);
        throw new ConnectionConflictError('Connection request already pending.', 'CONNECTION_REQUEST_ALREADY_EXISTS');
      }
      console.error(`[sendConnectionRequest] Database error creating connection request [${requestId}]:`, insertError);
      throw new ConnectionError(`Database error creating connection request: ${insertError.message}`, 500, 'DATABASE_ERROR');
    }

    const { status, ...rest } = newRequest;
    return rest;
  } finally {
    inFlightRequestLocks.delete(pairKey);
    releaseLock();
  }
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
    throw new ConnectionError(`Database error querying connection requests: ${error.message}`, 500, 'DATABASE_ERROR');
  }

  const combined = data || [];

  return combined
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(({ status, ...rest }) => rest);
}

export async function acceptConnectionRequest(requestId: string, userId: string) {
  const supabase = getSupabaseClient();

  // Transactional RPC is the ONLY connection acceptance path. Non-atomic fallback is strictly prohibited.
  const { data: rpcData, error: rpcError } = await supabase.rpc('accept_connection_request', {
    p_user_id: userId,
    p_request_id: requestId,
  });

  if (rpcError) {
    const msg = rpcError.message || '';
    const code = rpcError.code || '';

    if (msg.includes('Connection request not found')) {
      throw new ConnectionNotFoundError('Connection request not found.', 'REQUEST_NOT_FOUND');
    }
    if (msg.includes('Forbidden: Not your connection request')) {
      throw new ConnectionForbiddenError('Forbidden: Not your connection request.', 'FORBIDDEN');
    }
    if (msg.includes('Connection request is no longer pending')) {
      throw new ConnectionConflictError('Connection request is no longer pending.', 'REQUEST_NOT_PENDING');
    }
    if (msg.includes('DUPLICATE_CONNECTION') || code === '23505') {
      const { data: existing } = await supabase
        .from('connections')
        .select('*')
        .eq('requestId', requestId)
        .maybeSingle();
      if (existing) return existing as ConnectionRecord;
      throw new ConnectionConflictError('Duplicate connection detected.', 'DUPLICATE_CONNECTION');
    }

    const isMissingFunction = code === 'PGRST202' || code === '42883' || msg.includes('Could not find the function') || msg.includes('operator does not exist');
    if (isMissingFunction) {
      console.error(`[acceptConnectionRequest] Transactional RPC accept_connection_request is missing or failing (code: ${code}, msg: ${msg}). Non-atomic fallback is strictly prohibited.`);
      throw new ConnectionCapabilityError('Failed to establish connection: Transactional database procedure is not available.');
    }

    console.error('[acceptConnectionRequest] Transaction error:', rpcError.message || rpcError);
    throw new ConnectionError('Database error establishing connection.', 500, 'DATABASE_ERROR');
  }

  if (!rpcData) {
    throw new ConnectionError('Database error establishing connection: No data returned.', 500, 'DATABASE_ERROR');
  }

  const connRecord = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as ConnectionRecord;
  return connRecord;
}

export async function getRecentConnectionRequests(limit = 20) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('connection_requests')
    .select('*')
    .order('createdAt', { ascending: false })
    .limit(limit);

  if (error) {
    throw new ConnectionError(`Database error querying connection requests: ${error.message}`, 500, 'DATABASE_ERROR');
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
    throw new ConnectionError(`Database error querying recent connections: ${error.message}`, 500, 'DATABASE_ERROR');
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
    throw new ConnectionNotFoundError('Connection request not found.', 'REQUEST_NOT_FOUND');
  }

  // Verify participant access (either sender or receiver can delete/cancel/reject)
  if (request.senderUserId !== userId && request.receiverUserId !== userId) {
    throw new ConnectionForbiddenError('Forbidden: Not your connection request.', 'FORBIDDEN');
  }

  // Delete request
  const { error: deleteError } = await supabase
    .from('connection_requests')
    .delete()
    .eq('id', requestId);

  if (deleteError) {
    throw new ConnectionError(`Database error deleting connection request: ${deleteError.message}`, 500, 'DATABASE_ERROR');
  }

  return { success: true, message: 'Connection request deleted successfully.' };
}

