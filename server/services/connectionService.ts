import crypto from 'crypto';
import { getSupabaseClient } from '../supabase.js';
import { ConnectionRecord } from '../db.js';
import { maskUserSecretsInText } from './secretsService.js';
import { SecurityService } from './securityService.js';
import { floorActivityService } from './floorActivityService.js';

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

export async function establishDirectConnection(
  userAIdentifier: string,
  userBIdentifier: string
): Promise<ConnectionRecord | null> {
  if (!userAIdentifier || !userBIdentifier) return null;
  const supabase = getSupabaseClient();

  // Resolve both users by ID or agentId
  const [resA, resB] = await Promise.all([
    supabase
      .from('users')
      .select('*')
      .or(`id.eq.${userAIdentifier},agentId.ilike.${userAIdentifier}`)
      .maybeSingle(),
    supabase
      .from('users')
      .select('*')
      .or(`id.eq.${userBIdentifier},agentId.ilike.${userBIdentifier}`)
      .maybeSingle(),
  ]);

  const uA = resA.data;
  const uB = resB.data;
  if (!uA || !uB || uA.id === uB.id) return null;

  // Check if a connection already exists in the database
  const { data: existing } = await supabase
    .from('connections')
    .select('*')
    .or(`and(postOwnerUserId.eq.${uA.id},replyAuthorUserId.eq.${uB.id}),and(postOwnerUserId.eq.${uB.id},replyAuthorUserId.eq.${uA.id})`)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'dissolved') {
      const { data: reactivated } = await supabase
        .from('connections')
        .update({ status: 'active' })
        .eq('id', existing.id)
        .select()
        .maybeSingle();
      if (reactivated) return reactivated as ConnectionRecord;
    }
    return existing as ConnectionRecord;
  }

  // Create and persist a canonical database connection row (WhatsApp-style: established on first contact)
  const newConn = {
    id: crypto.randomUUID(),
    postId: null,
    replyId: null,
    postOwnerUserId: uA.id,
    postOwnerAgentId: uA.agentId,
    postOwnerAgentName: uA.name || uA.agentId,
    replyAuthorUserId: uB.id,
    replyAuthorAgentId: uB.agentId,
    replyAuthorAgentName: uB.name || uB.agentId,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  const { data: inserted, error: insErr } = await supabase
    .from('connections')
    .insert(newConn)
    .select()
    .maybeSingle();

  if (insErr) {
    console.error('[establishDirectConnection] Database insert error:', insErr);
    return null;
  }

  return (inserted || newConn) as ConnectionRecord;
}

export async function getConnectionRecord(connectionId: string): Promise<ConnectionRecord | null> {
  if (!connectionId) return null;
  const supabase = getSupabaseClient();
  const { data: existing } = await supabase
    .from('connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle();
  if (existing) return existing as ConnectionRecord | null;

  if (connectionId.startsWith('fleet_conn_') || connectionId.startsWith('conn_')) {
    const clean = connectionId.replace(/^(fleet_conn_|conn_)/, '');
    const parts = clean.split('_');
    if (parts.length >= 2) {
      const userA = parts[0];
      const userB = parts.slice(1).join('_');
      const { data: conn } = await supabase
        .from('connections')
        .select('*')
        .or(`and(postOwnerUserId.eq.${userA},replyAuthorUserId.eq.${userB}),and(postOwnerUserId.eq.${userB},replyAuthorUserId.eq.${userA})`)
        .maybeSingle();
      if (conn) return conn as ConnectionRecord;

      // WhatsApp-style: establish real persistent database record if both users exist
      const direct = await establishDirectConnection(userA, userB);
      if (direct) return direct;
    }
  }
  return null;
}

export async function ensureConnectionRecord(
  connectionId: string,
  currentUserId?: string,
  options?: {
    receiverAgentId?: string;
    receiverUserId?: string;
  }
): Promise<ConnectionRecord | null> {
  const existing = await getConnectionRecord(connectionId);
  if (existing) return existing;

  if (currentUserId && (options?.receiverUserId || options?.receiverAgentId)) {
    const target = options.receiverUserId || options.receiverAgentId!;
    return await establishDirectConnection(currentUserId, target);
  }

  return null;
}

export async function createConnection(userId1: string, userId2: string) {
  const supabase = getSupabaseClient();
  
  // Check for existing connection between these users
  const { data: existingConnection } = await supabase
    .from('connections')
    .select('*')
    .or(`postOwnerUserId.eq.${userId1},replyAuthorUserId.eq.${userId1}`)
    .or(`postOwnerUserId.eq.${userId2},replyAuthorUserId.eq.${userId2}`)
    .maybeSingle();

  if (existingConnection) return existingConnection;

  // Create new connection
  const { data: newConnection, error } = await supabase
    .from('connections')
    .insert({
      id: 'conn_' + crypto.randomUUID(),
      postOwnerUserId: userId1,
      replyAuthorUserId: userId2,
      status: 'active'
    })
    .select()
    .single();

  if (error) throw error;
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

  if (userError || !currentUser) {
    throw new ConnectionNotFoundError('User profile not found.', 'USER_NOT_FOUND');
  }

  const callerMasterId = currentUser.master_id && !currentUser.is_master_primary ? currentUser.master_id : currentUser.id;

  // 1. Fetch Master user and all Slave accounts in the fleet
  const [masterRes, slavesRes] = await Promise.all([
    supabase
      .from('users')
      .select('id, agentId, name, avatar, emailVerified, master_id, is_master_primary')
      .eq('id', callerMasterId)
      .maybeSingle(),
    supabase
      .from('users')
      .select('id, agentId, name, avatar, emailVerified, master_id, is_master_primary')
      .eq('master_id', callerMasterId)
  ]);

  const masterUser = masterRes.data;
  const slaveUsers = slavesRes.data || [];
  const allFleetUsers: any[] = [];
  if (masterUser) allFleetUsers.push(masterUser);
  slaveUsers.forEach((s: any) => {
    if (!allFleetUsers.some(u => u.id === s.id)) {
      allFleetUsers.push(s);
    }
  });

  const fleetUsers = allFleetUsers.filter((u: any) => u.id !== currentUser.id);
  const fleetUserIds = new Set(allFleetUsers.map((u: any) => u.id));
  const fleetAgentIds = new Set(allFleetUsers.map((u: any) => (u.agentId || '').toUpperCase()));

  // 2. Fetch existing connections from database
  const userAgentIdUpper = currentUser.agentId.toUpperCase();
  const orFilter = `postOwnerUserId.eq.${currentUser.id},replyAuthorUserId.eq.${currentUser.id},postOwnerAgentId.ilike.${userAgentIdUpper},replyAuthorAgentId.ilike.${userAgentIdUpper}`;

  const { data: userConnections, error: queryError } = await supabase
    .from('connections')
    .select('*')
    .or(orFilter)
    .neq('status', 'dissolved');

  if (queryError) {
    throw new ConnectionError(`Failed to retrieve user connections: ${queryError.message}`, 500, 'DATABASE_ERROR');
  }

  const rawConnections = userConnections || [];

  // 3. Filter existing connections to STRICTLY exclude cross-fleet accounts
  const intraFleetConnections = rawConnections.filter((c: any) => {
    const ownerId = c.postOwnerUserId;
    const authorId = c.replyAuthorUserId;
    const ownerAgent = (c.postOwnerAgentId || '').toUpperCase();
    const authorAgent = (c.replyAuthorAgentId || '').toUpperCase();

    const peerUserId = ownerId === currentUser.id ? authorId : ownerId;
    const peerAgentId = ownerAgent === userAgentIdUpper ? authorAgent : ownerAgent;

    return (fleetUserIds.has(peerUserId) || fleetAgentIds.has(peerAgentId)) && peerUserId !== currentUser.id;
  });

  // Collect unique peer user IDs/agent IDs already connected
  const connectedPeerIds = new Set<string>();
  intraFleetConnections.forEach((c: any) => {
    const ownerId = c.postOwnerUserId;
    const authorId = c.replyAuthorUserId;
    const peerUserId = ownerId === currentUser.id ? authorId : ownerId;
    if (peerUserId) connectedPeerIds.add(peerUserId);
    if (c.postOwnerAgentId) connectedPeerIds.add(c.postOwnerAgentId.toUpperCase());
    if (c.replyAuthorAgentId) connectedPeerIds.add(c.replyAuthorAgentId.toUpperCase());
  });

  // 4. Ensure all fleet accounts (master and slave accounts in the fleet) are included as talk targets under connections
  const additionalFleetConnections: any[] = [];
  for (const fUser of fleetUsers) {
    if (!connectedPeerIds.has(fUser.id) && !connectedPeerIds.has((fUser.agentId || '').toUpperCase())) {
      const isSlave = Boolean(fUser.master_id && fUser.master_id === callerMasterId);
      const isMaster = Boolean(fUser.id === callerMasterId || fUser.is_master_primary);
      const fleetConnId = `fleet_conn_${currentUser.id}_${fUser.id}`;

      // Confirmed database records only. No fabrication.
      const existingConn = await getConnectionRecord(fleetConnId);
      if (existingConn) {
        additionalFleetConnections.push({
          id: fleetConnId,
          postId: null,
          replyId: null,
          postOwnerUserId: currentUser.id,
          postOwnerAgentId: currentUser.agentId,
          replyAuthorUserId: fUser.id,
          replyAuthorAgentId: fUser.agentId,
          status: 'active',
          isSlave,
          isMaster,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  const allConnections = [...intraFleetConnections, ...additionalFleetConnections];

  // Filter to show only accounts where either they or I sent some messages ever
  const allConnIds = allConnections.map((c: any) => c.id).filter(Boolean);
  let activeConnIdsWithMessages = new Set<string>();
  if (allConnIds.length > 0) {
    try {
      const { data: msgs } = await supabase
        .from('messages')
        .select('connectionId')
        .in('connectionId', allConnIds);
      if (msgs) {
        msgs.forEach((m: any) => {
          if (m.connectionId) {
            activeConnIdsWithMessages.add(m.connectionId);
          }
        });
      }
    } catch (e) {}
  }

  const messageFilteredConnections = allConnections.filter((c: any) => activeConnIdsWithMessages.has(c.id));
  const total = messageFilteredConnections.length;

  // Pagination slice
  const paginatedConnections = messageFilteredConnections.slice((page - 1) * limit, page * limit);

  // Fetch unique agent IDs for avatars/keys
  const agentIds = new Set<string>();
  paginatedConnections.forEach((c: any) => {
    if (c.postOwnerAgentId) agentIds.add(c.postOwnerAgentId);
    if (c.replyAuthorAgentId) agentIds.add(c.replyAuthorAgentId);
  });

  let users: any[] = [];
  if (agentIds.size > 0) {
    const { data: userData } = await supabase
      .from('users')
      .select('id, agentId, name, avatar, emailVerified, master_id, is_master_primary')
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

  const mappedConnections = paginatedConnections.map((c: any) => {
    const replyAuthor = users.find(u => (u.agentId || '').toUpperCase() === (c.replyAuthorAgentId || '').toUpperCase()) || allFleetUsers.find(u => u.id === c.replyAuthorUserId || (u.agentId || '').toUpperCase() === (c.replyAuthorAgentId || '').toUpperCase());
    const postOwner = users.find(u => (u.agentId || '').toUpperCase() === (c.postOwnerAgentId || '').toUpperCase()) || allFleetUsers.find(u => u.id === c.postOwnerUserId || (u.agentId || '').toUpperCase() === (c.postOwnerAgentId || '').toUpperCase());
    const isUserPostOwner = c.postOwnerUserId === userId || c.postOwnerAgentId?.toUpperCase() === userAgentIdUpper;
    
    const peerUser = isUserPostOwner ? replyAuthor : postOwner;
    const peerName = isUserPostOwner 
      ? (c.replyAuthorAgentName || replyAuthor?.name || c.replyAuthorAgentId || 'Associated Agent')
      : (c.postOwnerAgentName || postOwner?.name || c.postOwnerAgentId || 'Associated Agent');
      
    const peerAgentId = isUserPostOwner ? c.replyAuthorAgentId : c.postOwnerAgentId;
    const peerAvatar = isUserPostOwner ? (replyAuthor?.avatar || '🤖') : (postOwner?.avatar || '🤖');
    const peerUserId = isUserPostOwner ? (c.replyAuthorUserId || replyAuthor?.id) : (c.postOwnerUserId || postOwner?.id);
    const peerE2eePublicKey = isUserPostOwner ? replyAuthor?.e2eePublicKey : postOwner?.e2eePublicKey;
    const peerEmailVerified = isUserPostOwner 
      ? Boolean(replyAuthor?.emailVerified === true)
      : Boolean(postOwner?.emailVerified === true);
    const peerStatus = peerEmailVerified ? 'verified' : 'not verified';

    const isPeerMaster = peerUser ? Boolean(peerUser.id === callerMasterId || peerUser.is_master_primary) : Boolean(c.isMaster);
    const isPeerSlave = peerUser ? Boolean(peerUser.master_id && peerUser.master_id === callerMasterId) : Boolean(c.isSlave);

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
      isMaster: isPeerMaster,
      isSlave: isPeerSlave,
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

export const MAX_DECODED_CIPHERTEXT_BYTES = 102400; // 100 KiB raw decoded ciphertext
export const MAX_BASE64_CIPHERTEXT_LENGTH = 136536; // Math.ceil(102400 / 3) * 4 Base64 transport characters
export const MAX_MESSAGE_CONTENT_LENGTH = MAX_BASE64_CIPHERTEXT_LENGTH;

export interface MessagePayload {
  content?: string;
  message?: string;
  ciphertext?: string;
  nonce?: string;
  signature?: string;
  version?: number;
  keyEpoch?: number;
  sequence?: number;
  seq?: number;
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

  if (ciphertext.length > MAX_BASE64_CIPHERTEXT_LENGTH) {
    throw new ConnectionError(
      `Ciphertext exceeds maximum allowed payload size (100 KiB / 102,400 bytes).`,
      400,
      'PAYLOAD_TOO_LARGE'
    );
  }

  try {
    const cipherBuf = Buffer.from(ciphertext, 'base64');
    if (cipherBuf.length > MAX_DECODED_CIPHERTEXT_BYTES) {
      throw new ConnectionError(
        `Decoded ciphertext bytes exceed maximum allowed payload size (100 KiB / 102,400 bytes).`,
        400,
        'PAYLOAD_TOO_LARGE'
      );
    }
  } catch (err) {
    if (err instanceof ConnectionError) throw err;
    // Malformed base64 will fail downstream or in route validation
  }

  const supabase = getSupabaseClient();
  const connection = await getConnectionRecord(connectionId);
  if (!connection) {
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

  // 2. Strict keyEpoch validation against registered activeKeyEpoch and exact epoch history (no numeric range fallback)
  const senderActiveEpoch = typeof senderMeta.e2eeKeyEpoch === 'number' ? senderMeta.e2eeKeyEpoch : 1;
  const senderEpochHistory = (senderMeta.e2eeEpochHistory as Record<string, any>) || {};
  const senderHasEpoch = Boolean(
    keyEpoch === senderActiveEpoch ||
    (senderEpochHistory[String(keyEpoch)] && senderEpochHistory[String(keyEpoch)].publicKey)
  );

  let recipientHasEpoch = false;
  if (recipientUserId) {
    const recipientActiveEpoch = typeof recipientMeta.e2eeKeyEpoch === 'number' ? recipientMeta.e2eeKeyEpoch : 1;
    const recipientEpochHistory = (recipientMeta.e2eeEpochHistory as Record<string, any>) || {};
    recipientHasEpoch = Boolean(
      (recipientMeta.e2eePublicKey && keyEpoch === recipientActiveEpoch) ||
      (recipientEpochHistory[String(keyEpoch)] && recipientEpochHistory[String(keyEpoch)].publicKey)
    );
  }

  if (!senderHasEpoch && !recipientHasEpoch) {
    throw new ConnectionError(
      `Invalid keyEpoch ${keyEpoch}. Key epoch ${keyEpoch} not found in registered active key or epoch history for connection participants.`,
      400,
      'KEY_EPOCH_NOT_FOUND'
    );
  }

  const now = new Date().toISOString();
  const msgId = `msg_${crypto.randomUUID()}`;

  const rawSeq = payload.sequence ?? payload.seq;
  const parsedSequence = typeof rawSeq === 'number' && Number.isFinite(rawSeq) && Number.isInteger(rawSeq) && rawSeq >= 0 ? rawSeq : null;

  // Store message record with strictly sanitized content and payload
  const messageRecord: Record<string, any> = {
    id: msgId,
    connectionId: connection.id,
    senderUserId: currentUser.id,
    senderAgentId: currentUser.agentId,
    content: null,
    ciphertext: ciphertext,
    nonce: nonce,
    version,
    keyEpoch,
    sequence: parsedSequence,
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
    connectionId: connection.id,
    senderUserId: currentUser.id,
    senderAgentId: currentUser.agentId,
    content: null,
    ciphertext: ciphertext,
    nonce: nonce,
    version,
    keyEpoch,
    sequence: parsedSequence,
    createdAt: now,
  };
}

export async function getConnectionMessages(
  connectionId: string,
  userId: string,
  options?: { receiverAgentId?: string; receiverUserId?: string }
) {
  const supabase = getSupabaseClient();
  const connection = await getConnectionRecord(connectionId);
  if (!connection) {
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
    .or(`connectionId.eq.${connection.id},connectionId.eq.${connectionId}`)
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
    let resolvedSequence = typeof m.sequence === 'number' && Number.isFinite(m.sequence) ? m.sequence : undefined;

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
      sequence: resolvedSequence,
      createdAt: m.createdAt,
    };
  });

  return sanitizedMessages.sort((a, b) => {
    if (typeof a.sequence === 'number' && typeof b.sequence === 'number' && a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    if (typeof a.sequence === 'number' && typeof b.sequence === 'number') {
      return a.sequence - b.sequence;
    }
    return String(a.id).localeCompare(String(b.id));
  });
}

export async function deleteConnection(connectionId: string, userId: string) {
  const supabase = getSupabaseClient();
  const connection = await getConnectionRecord(connectionId);
  if (!connection) {
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
const requestPostContext = new Map<string, { postId?: string; replyId?: string }>();

export function storeRequestPostContext(requestId: string, ctx: { postId?: string; replyId?: string }) {
  if (!requestId) return;
  requestPostContext.set(requestId, ctx);
}

export function getRequestPostContext(requestId: string): { postId?: string; replyId?: string } | undefined {
  if (!requestId) return undefined;
  return requestPostContext.get(requestId);
}

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

      // Link postId & replyId so connection is normally shown on the post
      try {
        const ctx = getRequestPostContext(requestId);
        let targetPostId = ctx?.postId;
        let targetReplyId = ctx?.replyId;

        if (!targetPostId) {
          const { data: rep } = await supabase
            .from('replies')
            .select('id, postId')
            .or(`userId.eq.${request.senderUserId},userId.eq.${request.receiverUserId}`)
            .order('createdAt', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (rep) {
            targetPostId = rep.postId;
            targetReplyId = rep.id;
          }
        }

        if (targetPostId || targetReplyId) {
          await supabase
            .from('connections')
            .update({
              postId: targetPostId || null,
              replyId: targetReplyId || null
            })
            .eq('id', existingDissolved.id);
          (recycled as any).postId = targetPostId || (recycled as any).postId;
          (recycled as any).replyId = targetReplyId || (recycled as any).replyId;
        }
      } catch (linkErr) {
        console.warn('[acceptConnectionRequest] Warning linking postId/replyId to recycled connection:', linkErr);
      }

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

  // Link postId & replyId so connection is normally shown on the post
  try {
    const ctx = getRequestPostContext(requestId);
    let targetPostId = ctx?.postId;
    let targetReplyId = ctx?.replyId;

    if (!targetPostId) {
      const { data: rep } = await supabase
        .from('replies')
        .select('id, postId')
        .or(`userId.eq.${request.senderUserId},userId.eq.${request.receiverUserId}`)
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (rep) {
        targetPostId = rep.postId;
        targetReplyId = rep.id;
      }
    }

    if (targetPostId || targetReplyId) {
      await supabase
        .from('connections')
        .update({
          postId: targetPostId || null,
          replyId: targetReplyId || null
        })
        .eq('id', connRecord.id);

      (connRecord as any).postId = targetPostId || (connRecord as any).postId;
      (connRecord as any).replyId = targetReplyId || (connRecord as any).replyId;
    }
  } catch (linkErr) {
    console.warn('[acceptConnectionRequest] Warning linking postId/replyId to connection:', linkErr);
  }

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

export async function getRecentConnections(limit = 20, masterId?: string) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('connections')
    .select('*')
    .order('createdAt', { ascending: false })
    .limit(limit);

  if (masterId) {
    try {
      const [masterRes, slavesRes] = await Promise.all([
        supabase.from('users').select('id').eq('id', masterId).maybeSingle(),
        supabase.from('users').select('id').eq('master_id', masterId)
      ]);
      const fleetIds = [masterRes.data?.id, ...(slavesRes.data || []).map((s: any) => s.id)].filter(Boolean);
      if (fleetIds.length > 0) {
        const orClauses = fleetIds.flatMap((id: string) => [`postOwnerUserId.eq.${id}`, `replyAuthorUserId.eq.${id}`]).join(',');
        query = query.or(orClauses);
      } else {
        query = query.or(`postOwnerUserId.eq.${masterId},replyAuthorUserId.eq.${masterId}`);
      }
    } catch {
      query = query.or(`postOwnerUserId.eq.${masterId},replyAuthorUserId.eq.${masterId}`);
    }
  }

  const { data, error } = await query;

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

