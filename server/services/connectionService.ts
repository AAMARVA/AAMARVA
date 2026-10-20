import crypto from 'crypto';
import { getSupabaseClient } from '../supabase.js';
import { ConnectionRecord } from '../db.js';

import { SecurityService } from './securityService.js';
import { watchtowerActivityService } from './watchtowerActivityService.js';

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

export function isSlaveAccount(u: any): boolean {
  if (!u) return false;
  if (
    u.account_type === 'master' ||
    u.isMasterUser === true ||
    u.is_master_primary === true ||
    u.isMasterPrimary === true
  ) {
    return false;
  }
  return Boolean(
    u.account_type === 'slave' ||
    u.role === 'slave' ||
    u.is_slave === true ||
    u.isSlave === true ||
    (u.master_id && u.id && String(u.master_id).toLowerCase() !== String(u.id).toLowerCase()) ||
    (u.masterUserId && u.id && String(u.masterUserId).toLowerCase() !== String(u.id).toLowerCase()) ||
    (u.email && typeof u.email === 'string' && u.email.includes('+AMR-'))
  );
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

  if (isSlaveAccount(uA) && isSlaveAccount(uB)) {
    throw new ConnectionForbiddenError(
      'Forbidden: Slave-to-slave connection is strictly prohibited.',
      'SLAVE_TO_SLAVE_CONNECTION_FORBIDDEN'
    );
  }

  // Check if a connection already exists in the database
  const { data: existing } = await supabase
    .from('connections')
    .select('*')
    .or(`and(user1_id.eq.${uA.id},user2_id.eq.${uB.id}),and(user1_id.eq.${uB.id},user2_id.eq.${uA.id})`)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'dissolved') {
      const { data: reactivated } = await supabase
        .from('connections')
        .update({ status: 'active' })
        .eq('id', existing.id)
        .select()
        .maybeSingle();
      if (reactivated) {
        try {
          const peerDisplay = (uB.agentId || uB.name || 'peer').replace(/^@+/, '');
          watchtowerActivityService.recordWatchtowerActivity({
            agentId: uA.agentId || uA.id,
            agentName: uA.name || uA.agentId || 'Agent',
            avatar: uA.avatar || '🤖',
            emailVerified: Boolean(uA.emailVerified),
            text: `re-established connection with @${peerDisplay}`,
            type: 'connection',
            peerName: peerDisplay,
            peerAgentId: uB.agentId,
            peerUserId: uB.id,
            actorUserId: uA.id,
            masterId: (uA.master_id && !uA.is_master_primary) ? uA.master_id : uA.id,
            peerMasterId: (uB.master_id && !uB.is_master_primary) ? uB.master_id : uB.id,
            entityId: existing.id,
            activityKey: `conn_reactivated:${existing.id}`
          }).catch(console.warn);
        } catch {}
        return reactivated as ConnectionRecord;
      }
    }
    return existing as ConnectionRecord;
  }

  // Create and persist a canonical database connection row (WhatsApp-style: established on first contact)
  const newConn: ConnectionRecord = {
    id: crypto.randomUUID(),
    user1_id: uA.id,
    user1_agent_id: uA.agentId,
    user1_agent_name: uA.name || uA.agentId,
    user2_id: uB.id,
    user2_agent_id: uB.agentId,
    user2_agent_name: uB.name || uB.agentId,
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

  const finalRecord = (inserted || newConn) as ConnectionRecord;

  try {
    const peerDisplay = (uB.agentId || uB.name || 'peer').replace(/^@+/, '');
    watchtowerActivityService.recordWatchtowerActivity({
      agentId: uA.agentId || uA.id,
      agentName: uA.name || uA.agentId || 'Agent',
      avatar: uA.avatar || '🤖',
      emailVerified: Boolean(uA.emailVerified),
      text: `formed a connection with @${peerDisplay}`,
      type: 'connection',
      peerName: peerDisplay,
      peerAgentId: uB.agentId,
      peerUserId: uB.id,
      actorUserId: uA.id,
      masterId: (uA.master_id && !uA.is_master_primary) ? uA.master_id : uA.id,
      peerMasterId: (uB.master_id && !uB.is_master_primary) ? uB.master_id : uB.id,
      entityId: finalRecord.id,
      activityKey: `conn_est:${finalRecord.id}`
    }).catch(console.warn);
  } catch {}

  return finalRecord;
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
        .or(`and(user1_id.eq.${userA},user2_id.eq.${userB}),and(user1_id.eq.${userB},user2_id.eq.${userA})`)
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

  const [u1Res, u2Res] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId1).maybeSingle(),
    supabase.from('users').select('*').eq('id', userId2).maybeSingle()
  ]);

  if (isSlaveAccount(u1Res.data) && isSlaveAccount(u2Res.data)) {
    throw new ConnectionForbiddenError(
      'Forbidden: Slave-to-slave connection is strictly prohibited.',
      'SLAVE_TO_SLAVE_CONNECTION_FORBIDDEN'
    );
  }

  // Check for existing connection between these users
  const { data: existingConnection } = await supabase
    .from('connections')
    .select('*')
    .or(`and(user1_id.eq.${userId1},user2_id.eq.${userId2}),and(user1_id.eq.${userId2},user2_id.eq.${userId1})`)
    .maybeSingle();

  if (existingConnection) return existingConnection;

  const u1 = u1Res.data;
  const u2 = u2Res.data;

  // Create new connection
  const { data: newConnection, error } = await supabase
    .from('connections')
    .insert({
      id: 'conn_' + crypto.randomUUID(),
      user1_id: userId1,
      user1_agent_id: u1?.agentId || '',
      user1_agent_name: u1?.name || u1?.agentId || 'Agent',
      user2_id: userId2,
      user2_agent_id: u2?.agentId || '',
      user2_agent_name: u2?.name || u2?.agentId || 'Agent',
      status: 'active',
      createdAt: new Date().toISOString()
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
  const orFilter = `user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id},user1_agent_id.ilike.${userAgentIdUpper},user2_agent_id.ilike.${userAgentIdUpper}`;

  let { data: userConnections, error: queryError } = await supabase
    .from('connections')
    .select('*')
    .or(orFilter)
    .neq('status', 'dissolved');

  if (queryError && (queryError.message.includes('user1_id') || queryError.message.includes('does not exist'))) {
    const fallbackOrFilter = `postOwnerUserId.eq.${currentUser.id},replyAuthorUserId.eq.${currentUser.id},postOwnerAgentId.ilike.${userAgentIdUpper},replyAuthorAgentId.ilike.${userAgentIdUpper}`;
    const fallbackRes = await supabase
      .from('connections')
      .select('*')
      .or(fallbackOrFilter)
      .neq('status', 'dissolved');
    userConnections = fallbackRes.data;
    queryError = fallbackRes.error;
  }

  if (queryError) {
    throw new ConnectionError(`Failed to retrieve user connections: ${queryError.message}`, 500, 'DATABASE_ERROR');
  }

  const rawConnections = userConnections || [];

  // 3. Filter existing connections to STRICTLY exclude cross-fleet accounts
  const intraFleetConnections = rawConnections.filter((c: any) => {
    const u1Id = c.user1_id || c.postOwnerUserId;
    const u2Id = c.user2_id || c.replyAuthorUserId;
    const a1 = (c.user1_agent_id || c.postOwnerAgentId || '').toUpperCase();
    const a2 = (c.user2_agent_id || c.replyAuthorAgentId || '').toUpperCase();

    const peerUserId = u1Id === currentUser.id ? u2Id : u1Id;
    const peerAgentId = a1 === userAgentIdUpper ? a2 : a1;

    return (fleetUserIds.has(peerUserId) || fleetAgentIds.has(peerAgentId)) && peerUserId !== currentUser.id;
  });

  // Collect unique peer user IDs/agent IDs already connected
  const connectedPeerIds = new Set<string>();
  intraFleetConnections.forEach((c: any) => {
    const u1Id = c.user1_id || c.postOwnerUserId;
    const u2Id = c.user2_id || c.replyAuthorUserId;
    const peerUserId = u1Id === currentUser.id ? u2Id : u1Id;
    if (peerUserId) connectedPeerIds.add(peerUserId);
    if (c.user1_agent_id) connectedPeerIds.add(c.user1_agent_id.toUpperCase());
    if (c.user2_agent_id) connectedPeerIds.add(c.user2_agent_id.toUpperCase());
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
          user1_id: currentUser.id,
          user1_agent_id: currentUser.agentId,
          user1_agent_name: currentUser.name || currentUser.agentId,
          user2_id: fUser.id,
          user2_agent_id: fUser.agentId,
          user2_agent_name: fUser.name || fUser.agentId,
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
    const a1 = c.user1_agent_id || c.postOwnerAgentId;
    const a2 = c.user2_agent_id || c.replyAuthorAgentId;
    if (a1) agentIds.add(a1);
    if (a2) agentIds.add(a2);
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
    const u1Id = c.user1_id || c.postOwnerUserId;
    const u2Id = c.user2_id || c.replyAuthorUserId;
    const a1 = c.user1_agent_id || c.postOwnerAgentId;
    const a2 = c.user2_agent_id || c.replyAuthorAgentId;
    const name1 = c.user1_agent_name || c.postOwnerAgentName;
    const name2 = c.user2_agent_name || c.replyAuthorAgentName;

    const user1Obj = users.find(u => (u.agentId || '').toUpperCase() === (a1 || '').toUpperCase()) || allFleetUsers.find(u => u.id === u1Id || (u.agentId || '').toUpperCase() === (a1 || '').toUpperCase());
    const user2Obj = users.find(u => (u.agentId || '').toUpperCase() === (a2 || '').toUpperCase()) || allFleetUsers.find(u => u.id === u2Id || (u.agentId || '').toUpperCase() === (a2 || '').toUpperCase());

    const isUser1 = u1Id === userId || (a1 && a1.toUpperCase() === userAgentIdUpper);
    const peerUser = isUser1 ? user2Obj : user1Obj;
    const peerName = isUser1
      ? (name2 || user2Obj?.name || a2 || 'Associated Agent')
      : (name1 || user1Obj?.name || a1 || 'Associated Agent');
      
    const peerAgentId = isUser1 ? a2 : a1;
    const peerAvatar = isUser1 ? (user2Obj?.avatar || '🤖') : (user1Obj?.avatar || '🤖');
    const peerUserId = isUser1 ? (u2Id || user2Obj?.id) : (u1Id || user1Obj?.id);
    const peerE2eePublicKey = isUser1 ? user2Obj?.e2eePublicKey : user1Obj?.e2eePublicKey;
    const peerEmailVerified = isUser1 
      ? Boolean(user2Obj?.emailVerified === true)
      : Boolean(user1Obj?.emailVerified === true);
    const peerStatus = peerEmailVerified ? 'verified' : 'not verified';

    const isPeerMaster = peerUser ? Boolean(peerUser.id === callerMasterId || peerUser.is_master_primary) : Boolean(c.isMaster);
    const isPeerSlave = peerUser ? Boolean(peerUser.master_id && peerUser.master_id === callerMasterId) : Boolean(c.isSlave);

    return {
      id: c.id,
      user1_id: u1Id,
      user1_agent_id: a1,
      user1_agent_name: name1,
      user2_id: u2Id,
      user2_agent_id: a2,
      user2_agent_name: name2,
      agentName: peerName,
      agentId: peerAgentId,
      peerE2eePublicKey,
      verificationStatus: peerStatus,
      verification_status: peerStatus,
      ["verification status"]: peerStatus,
      avatar: peerAvatar,
      emailVerified: peerEmailVerified,
      isHost: isUser1,
      isMaster: isPeerMaster,
      isSlave: isPeerSlave,
      status: c.status || 'active',
      connectionStatus: c.status || 'active',
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

  const user1 = connection.user1_id || (connection as any).postOwnerUserId;
  const user2 = connection.user2_id || (connection as any).replyAuthorUserId;

  if (currentUser.id !== user1 && currentUser.id !== user2) {
    throw new ConnectionForbiddenError('Forbidden: Not a participant of this connection.', 'FORBIDDEN');
  }

  if (connection.status === 'dissolved') {
    throw new ConnectionForbiddenError('Forbidden: This connection has been dissolved and cannot be messaged.', 'CONNECTION_DISSOLVED');
  }

  const recipientUserId = user1 === currentUser.id ? user2 : user1;

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
  const u1 = connection.user1_id || (connection as any).postOwnerUserId;
  const u2 = connection.user2_id || (connection as any).replyAuthorUserId;
  const u1Agent = connection.user1_agent_id || (connection as any).postOwnerAgentId;
  const u2Agent = connection.user2_agent_id || (connection as any).replyAuthorAgentId;

  const isParticipant =
    u1 === userId ||
    u2 === userId ||
    (currentAgentId && (
      (u1Agent && u1Agent.toLowerCase() === currentAgentId.toLowerCase()) ||
      (u2Agent && u2Agent.toLowerCase() === currentAgentId.toLowerCase())
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
  const u1 = connection.user1_id || (connection as any).postOwnerUserId;
  const u2 = connection.user2_id || (connection as any).replyAuthorUserId;
  const u1Agent = connection.user1_agent_id || (connection as any).postOwnerAgentId;
  const u2Agent = connection.user2_agent_id || (connection as any).replyAuthorAgentId;

  const isParticipant =
    u1 === userId ||
    u2 === userId ||
    (currentAgentId && (
      (u1Agent && u1Agent.toLowerCase() === currentAgentId.toLowerCase()) ||
      (u2Agent && u2Agent.toLowerCase() === currentAgentId.toLowerCase())
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

  // Broadcast connection dissolved to Watchtower
  try {
    const isUser1 = u1 === userId || (currentAgentId && u1Agent?.toLowerCase() === currentAgentId.toLowerCase());
    const peerUserId = isUser1 ? u2 : u1;
    const peerAgentId = isUser1 ? u2Agent : u1Agent;
    const cleanPeer = (peerAgentId || 'peer').replace(/^@+/, '');

    const { data: actorUser } = await supabase.from('users').select('name, avatar, emailVerified, master_id, is_master_primary').eq('id', userId).maybeSingle();
    watchtowerActivityService.recordWatchtowerActivity({
      agentId: currentAgentId || userId,
      agentName: actorUser?.name || currentAgentId || 'Agent',
      avatar: actorUser?.avatar || '🤖',
      emailVerified: Boolean(actorUser?.emailVerified),
      text: `disconnected from @${cleanPeer}`,
      type: 'connection',
      peerName: cleanPeer,
      peerAgentId,
      peerUserId,
      actorUserId: userId,
      masterId: (actorUser?.master_id && !actorUser?.is_master_primary) ? actorUser.master_id : userId,
      entityId: connectionId,
      activityKey: `conn_dissolved:${connectionId}`
    }).catch(console.warn);
  } catch (e) {}

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
        const orClauses = fleetIds.flatMap((id: string) => [`user1_id.eq.${id}`, `user2_id.eq.${id}`]).join(',');
        query = query.or(orClauses);
      } else {
        query = query.or(`user1_id.eq.${masterId},user2_id.eq.${masterId}`);
      }
    } catch {
      query = query.or(`user1_id.eq.${masterId},user2_id.eq.${masterId}`);
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new ConnectionError(`Database error querying recent connections: ${error.message}`, 500, 'DATABASE_ERROR');
  }

  return data || [];
}



