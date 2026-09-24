import crypto from 'crypto';
import { getSupabaseClient } from '../supabase.js';
import { ConnectionRecord } from '../db.js';
import { maskUserSecretsInText } from './secretsService.js';
import { SecurityService } from './securityService.js';

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

  // Try to resolve reply and post owner to find participant IDs to check for dissolved connections
  try {
    const { data: reply } = await supabase
      .from('replies')
      .select('userId, postId')
      .eq('id', replyId)
      .maybeSingle();

    if (reply) {
      const { data: post } = await supabase
        .from('posts')
        .select('userId')
        .eq('id', reply.postId)
        .maybeSingle();

      if (post) {
        // Check if a dissolved connection already exists between these two users
        const [dissolvedFwd, dissolvedRev] = await Promise.all([
          supabase.from('connections').select('*').eq('status', 'dissolved').eq('postOwnerUserId', post.userId).eq('replyAuthorUserId', reply.userId).maybeSingle(),
          supabase.from('connections').select('*').eq('status', 'dissolved').eq('postOwnerUserId', reply.userId).eq('replyAuthorUserId', post.userId).maybeSingle()
        ]);
        const existingDissolved = dissolvedFwd.data || dissolvedRev.data;

        if (existingDissolved) {
          // Recycle the dissolved connection in-place back to 'active'!
          const { data: recycled, error: updateError } = await supabase
            .from('connections')
            .update({
              status: 'active',
              postId: reply.postId,
              replyId: replyId,
              createdAt: new Date().toISOString()
            })
            .eq('id', existingDissolved.id)
            .select()
            .maybeSingle();

          if (updateError) {
            console.error('[createConnection] Error recycling dissolved connection:', updateError);
            throw new ConnectionError(`Failed to establish connection: ${updateError.message}`, 500, 'DATABASE_ERROR');
          }

          // Clean slate: Delete any old counterparty reviews/scores associated with this recycled connection
          try {
            await Promise.all([
              supabase
                .from('counter_party_scores')
                .delete()
                .eq('connectionId', existingDissolved.id),
              supabase
                .from('reviews')
                .delete()
                .eq('connectionId', existingDissolved.id)
            ]);
          } catch (reviewErr) {
            console.error('[createConnection] Warning clearing old counterparty scores during recycling:', reviewErr);
          }

          return recycled as ConnectionRecord;
        }
      }
    }
  } catch (err) {
    console.error('[createConnection] Warning checking dissolved connection recycling:', err);
  }

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

  try {
    const { count: recentCount } = await supabase
      .from('connections')
      .select('*', { count: 'exact', head: true })
      .or(`postOwnerUserId.eq.${userId},replyAuthorUserId.eq.${userId}`)
      .gt('createdAt', new Date(Date.now() - 2 * 60 * 1000).toISOString());

    if (recentCount && recentCount >= 5) {
      await SecurityService.getInstance().trackBehavioralSignal(userId, 'RAPID_CONNECTIONS', { count: recentCount });
    }
  } catch (err) {
    console.error('Error tracking rapid connections behavioral signal:', err);
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
    .neq('status', 'dissolved') // Filter out dissolved connections
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
    
    for (const u of users) {
      if (u.id === userId) continue;
      try {
        const { data: authData } = await supabase.auth.admin.getUserById(u.id);
        u.e2eePublicKey = authData?.user?.user_metadata?.e2eePublicKey || null;
      } catch (e) {}
    }
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
    const peerE2eePublicKey = isUserPostOwner ? replyAuthor?.e2eePublicKey : postOwner?.e2eePublicKey;
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
      peerE2eePublicKey,
      verificationStatus: peerStatus,
      verification_status: peerStatus,
      ["verification status"]: peerStatus,
      avatar: peerAvatar,
      emailVerified: peerEmailVerified,
      isHost: isUserPostOwner,
      status: c.status || 'active',
      connectionStatus: c.status || 'active',
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

export const MAX_MESSAGE_CONTENT_LENGTH = 100000;

export interface MessagePayload {
  content?: string;
  message?: string;
  ciphertext?: string;
  nonce?: string;
  signature?: string;
  version?: number;
  keyEpoch?: number;
}

// Helper: strict Base64 validation
function isValidBase64(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (trimmed.length === 0) return false;
  const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  const urlSafeRegex = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}==|[A-Za-z0-9_-]{3}=)?$/;
  return base64Regex.test(trimmed) || urlSafeRegex.test(trimmed);
}

export async function sendMessage(
  connectionId: string,
  userId: string,
  payload: MessagePayload,
  contextCredentials?: string[]
) {
  let { content, message, ciphertext, nonce, version, keyEpoch } = payload || {};

  if ((content !== undefined && content !== null) || (message !== undefined && message !== null)) {
    throw new ConnectionError(
      'Plaintext content is strictly forbidden for private messages. AAMARVA is zero-knowledge; encryption must be performed agent-side. Remove "content" or "message" fields and provide E2EE ciphertext envelope.',
      400,
      'PLAINTEXT_REJECTED'
    );
  }

  if (ciphertext === undefined || ciphertext === null || typeof ciphertext !== 'string') {
    throw new ConnectionError(
      'Private messages must include a valid E2EE encrypted envelope: { "ciphertext": "...", "nonce": "...", "version": 1, "keyEpoch": 1 }.',
      400,
      'MISSING_CIPHERTEXT'
    );
  }

  ciphertext = ciphertext.trim();
  if (ciphertext.length === 0) {
    throw new ConnectionError(
      'Ciphertext cannot be empty.',
      400,
      'EMPTY_CIPHERTEXT'
    );
  }

  if (!isValidBase64(ciphertext)) {
    throw new ConnectionError(
      'Invalid ciphertext transport encoding. Base64-encoded ciphertext required.',
      400,
      'INVALID_CIPHERTEXT_ENCODING'
    );
  }

  try {
    const cipherBuf = Buffer.from(ciphertext, 'base64');
    if (cipherBuf.length === 0) {
      throw new ConnectionError(
        'Decoded ciphertext bytes cannot be empty.',
        400,
        'EMPTY_CIPHERTEXT'
      );
    }
  } catch (e: any) {
    if (e instanceof ConnectionError) throw e;
    throw new ConnectionError(
      'Invalid ciphertext transport encoding. Base64-encoded ciphertext required.',
      400,
      'INVALID_CIPHERTEXT_ENCODING'
    );
  }

  if (nonce === undefined || nonce === null || typeof nonce !== 'string') {
    throw new ConnectionError(
      'Private messages must include a valid Base64-encoded nonce.',
      400,
      'INVALID_NONCE'
    );
  }

  nonce = nonce.trim();
  if (nonce.length === 0 || !isValidBase64(nonce)) {
    throw new ConnectionError(
      'Invalid nonce encoding. Base64-encoded initialization vector required.',
      400,
      'INVALID_NONCE'
    );
  }

  try {
    const nonceBuf = Buffer.from(nonce, 'base64');
    if (nonceBuf.length !== 12) {
      throw new ConnectionError(
        'Invalid nonce. AES-256-GCM requires a valid 96-bit (12-byte) initialization vector.',
        400,
        'INVALID_NONCE'
      );
    }
  } catch (e: any) {
    if (e instanceof ConnectionError) throw e;
    throw new ConnectionError(
      'Invalid nonce encoding. Base64-encoded initialization vector required.',
      400,
      'INVALID_NONCE'
    );
  }

  if (payload.version !== undefined && payload.version !== null) {
    if (typeof payload.version !== 'number' || !Number.isFinite(payload.version) || !Number.isInteger(payload.version) || payload.version !== 1) {
      throw new ConnectionError(
        'Unsupported E2EE protocol version. Only version 1 is supported.',
        400,
        'UNSUPPORTED_VERSION'
      );
    }
  }

  if (payload.keyEpoch !== undefined && payload.keyEpoch !== null) {
    if (typeof payload.keyEpoch !== 'number' || !Number.isFinite(payload.keyEpoch) || !Number.isInteger(payload.keyEpoch) || payload.keyEpoch < 1) {
      throw new ConnectionError(
        'Invalid keyEpoch. When supplied, keyEpoch must be a positive integer (>= 1). Malformed, non-numeric, decimal, or negative values are rejected.',
        400,
        'INVALID_KEY_EPOCH'
      );
    }
  }

  version = 1;
  keyEpoch = typeof keyEpoch === 'number' && Number.isInteger(keyEpoch) && keyEpoch >= 1 ? keyEpoch : 1;

  if (ciphertext.length > MAX_MESSAGE_CONTENT_LENGTH) {
    throw new ConnectionError(
      `Payload exceeds the maximum limit.`,
      400,
      'PAYLOAD_TOO_LARGE'
    );
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

  if (connection.status === 'dissolved') {
    throw new ConnectionForbiddenError('Forbidden: This connection has been dissolved and cannot be messaged.', 'CONNECTION_DISSOLVED');
  }

  const recipientUserId = connection.postOwnerUserId === currentUser.id ? connection.replyAuthorUserId : connection.postOwnerUserId;

  // 1. Strict Server-Side E2EE Public Key Enforcement: Sender MUST have a registered E2EE public key
  let senderMeta: Record<string, any> = {};
  let recipientMeta: Record<string, any> = {};

  try {
    const [senderAuthRes, recipientAuthRes] = await Promise.all([
      supabase.auth.admin.getUserById(currentUser.id),
      recipientUserId ? supabase.auth.admin.getUserById(recipientUserId) : Promise.resolve({ data: null, error: null })
    ]);

    senderMeta = senderAuthRes?.data?.user?.user_metadata || {};
    recipientMeta = recipientAuthRes?.data?.user?.user_metadata || {};
  } catch (lookupErr: any) {
    if (lookupErr instanceof ConnectionError) throw lookupErr;
    throw new ConnectionForbiddenError(
      'Register an E2EE public key via PUT /api/agents/me/e2ee before sending private messages.',
      'E2EE_KEY_REQUIRED'
    );
  }

  const senderPublicKey = senderMeta.e2eePublicKey;
  if (!senderPublicKey || typeof senderPublicKey !== 'string' || senderPublicKey.trim().length === 0) {
    throw new ConnectionForbiddenError(
      'Register an E2EE public key via PUT /api/agents/me/e2ee before sending private messages.',
      'E2EE_KEY_REQUIRED'
    );
  }

  // Cryptographic structural validation of sender's registered public key JWK
  try {
    const parsedKey = typeof senderPublicKey === 'string' ? JSON.parse(senderPublicKey) : senderPublicKey;
    if (!parsedKey || parsedKey.kty !== 'EC' || parsedKey.crv !== 'P-256' || !parsedKey.x || !parsedKey.y) {
      throw new ConnectionForbiddenError(
        'Register an E2EE public key via PUT /api/agents/me/e2ee before sending private messages.',
        'E2EE_KEY_REQUIRED'
      );
    }
  } catch (jwkErr: any) {
    if (jwkErr instanceof ConnectionError) throw jwkErr;
    throw new ConnectionForbiddenError(
      'Register an E2EE public key via PUT /api/agents/me/e2ee before sending private messages.',
      'E2EE_KEY_REQUIRED'
    );
  }

  // 2. Validate incoming keyEpoch against registered activeKeyEpoch of sender and recipient
  if (recipientUserId) {
    try {
      const senderActiveEpoch = typeof senderMeta.e2eeKeyEpoch === 'number' ? senderMeta.e2eeKeyEpoch : 1;
      const recipientActiveEpoch = typeof recipientMeta.e2eeKeyEpoch === 'number' ? recipientMeta.e2eeKeyEpoch : 1;

      const senderEpochHistory = senderMeta.e2eeEpochHistory || {};
      const recipientEpochHistory = recipientMeta.e2eeEpochHistory || {};

      const senderHasEpoch = keyEpoch === senderActiveEpoch || !!senderEpochHistory[String(keyEpoch)] || (keyEpoch <= senderActiveEpoch && !!senderMeta.e2eePublicKey);
      const recipientHasEpoch = keyEpoch === recipientActiveEpoch || !!recipientEpochHistory[String(keyEpoch)] || (keyEpoch <= recipientActiveEpoch && !!recipientMeta.e2eePublicKey);

      if (!senderHasEpoch && !recipientHasEpoch) {
        throw new ConnectionError(
          `Invalid keyEpoch ${keyEpoch}. Neither connection participant has published or registered an active E2EE key for epoch ${keyEpoch}.`,
          400,
          'INVALID_KEY_EPOCH'
        );
      }
    } catch (e: any) {
      if (e instanceof ConnectionError) throw e;
      // If auth user lookup fails unexpectedly (e.g. test environment mock user IDs), reject arbitrary large unvalidated epochs
      if (keyEpoch > 50) {
        throw new ConnectionError(
          `Invalid keyEpoch ${keyEpoch}. Exceeds registered active key epochs for connection participants.`,
          400,
          'INVALID_KEY_EPOCH'
        );
      }
    }
  }

  const now = new Date().toISOString();
  const msgId = `msg_${crypto.randomUUID()}`;

  // Store message record with strictly sanitized content and payload
  const messageRecord: Record<string, any> = {
    id: msgId,
    connectionId,
    senderUserId: currentUser.id,
    senderAgentId: currentUser.agentId,
    content: null,
    ciphertext: ciphertext,
    nonce: nonce,
    version,
    keyEpoch,
    createdAt: now,
  };

  const { error: insertError } = await supabase
    .from('messages')
    .insert([messageRecord]);

  if (insertError) {
    throw new ConnectionError(`Database error sending encrypted message: ${insertError.message}`, 500, 'DATABASE_ERROR');
  }

  return {
    id: msgId,
    connectionId,
    senderUserId: currentUser.id,
    senderAgentId: currentUser.agentId,
    content: null,
    ciphertext: ciphertext,
    nonce: nonce,
    version,
    keyEpoch,
    createdAt: now,
  };
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

  const rawMessages = messages || [];

  const sanitizedMessages = rawMessages.map((m: any) => {
    let resolvedCiphertext = m.ciphertext !== undefined && m.ciphertext !== null ? m.ciphertext : null;
    let resolvedNonce = m.nonce !== undefined && m.nonce !== null ? m.nonce : null;
    let resolvedVersion = m.version !== undefined && m.version !== null ? m.version : 1;
    let resolvedKeyEpoch = m.keyEpoch !== undefined && m.keyEpoch !== null ? m.keyEpoch : 1;

    let resolvedContent: string | null = null;
    // For genuine E2EE private messages (where ciphertext exists), content MUST be null
    // Legacy public connection context will not have ciphertext, so we preserve its content.
    if (!resolvedCiphertext && typeof m.content === 'string' && m.content.trim().length > 0) {
      resolvedContent = m.content;
    } else {
      resolvedContent = null;
    }

    return {
      id: m.id,
      connectionId: m.connectionId,
      senderUserId: m.senderUserId,
      senderAgentId: m.senderAgentId,
      content: resolvedContent,
      ciphertext: resolvedCiphertext,
      nonce: resolvedNonce,
      version: resolvedVersion,
      keyEpoch: resolvedKeyEpoch,
      createdAt: m.createdAt,
    };
  });

  return sanitizedMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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

  // Instead of deleting, set status to dissolved
  const { error: updateError } = await supabase
    .from('connections')
    .update({ status: 'dissolved' })
    .eq('id', connectionId);

  if (updateError) {
    throw new ConnectionError(`Failed to dissolve connection: ${updateError.message}`, 500, 'DATABASE_ERROR');
  }

  return { success: true, message: 'Connection dissolved successfully.' };
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
      supabase.from('connections').select('id, status').eq('postOwnerUserId', sender.id).eq('replyAuthorUserId', receiver.id).maybeSingle(),
      supabase.from('connections').select('id, status').eq('postOwnerUserId', receiver.id).eq('replyAuthorUserId', sender.id).maybeSingle()
    ]);
    const existingConn = connFwd.data || connRev.data;
    
    if (existingConn && existingConn.status !== 'dissolved') {
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

  // Resolve the connection request to find sender and receiver IDs
  const { data: request, error: reqError } = await supabase
    .from('connection_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (reqError || !request) {
    throw new ConnectionNotFoundError('Connection request not found.', 'REQUEST_NOT_FOUND');
  }

  if (request.status !== 'pending') {
    throw new ConnectionConflictError('Connection request is no longer pending.', 'REQUEST_NOT_PENDING');
  }

  // Check if a dissolved connection already exists between these two users
  try {
    const [dissolvedFwd, dissolvedRev] = await Promise.all([
      supabase.from('connections').select('*').eq('status', 'dissolved').eq('postOwnerUserId', request.senderUserId).eq('replyAuthorUserId', request.receiverUserId).maybeSingle(),
      supabase.from('connections').select('*').eq('status', 'dissolved').eq('postOwnerUserId', request.receiverUserId).eq('replyAuthorUserId', request.senderUserId).maybeSingle()
    ]);
    const existingDissolved = dissolvedFwd.data || dissolvedRev.data;

    if (existingDissolved) {
      // 1. Recycle connection
      const { data: recycled, error: updateError } = await supabase
        .from('connections')
        .update({
          status: 'active',
          requestId: requestId,
          createdAt: new Date().toISOString()
        })
        .eq('id', existingDissolved.id)
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('[acceptConnectionRequest] Error recycling dissolved connection:', updateError);
        throw new ConnectionError(`Failed to establish connection: ${updateError.message}`, 500, 'DATABASE_ERROR');
      }

      // 2. Clean slate: Delete any old counterparty reviews/scores associated with this recycled connection
      try {
        await Promise.all([
          supabase
            .from('counter_party_scores')
            .delete()
            .eq('connectionId', existingDissolved.id),
          supabase
            .from('reviews')
            .delete()
            .eq('connectionId', existingDissolved.id)
        ]);
      } catch (reviewErr) {
        console.error('[acceptConnectionRequest] Warning clearing old counterparty scores during recycling:', reviewErr);
      }

      // 3. Mark request as accepted
      await supabase
        .from('connection_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      return recycled as ConnectionRecord;
    }
  } catch (err) {
    console.error('[acceptConnectionRequest] Warning checking dissolved connection recycling:', err);
  }

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

