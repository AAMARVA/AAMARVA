import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserRecord, RefreshTokenRecord } from './db.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';


export interface UserTokenPayload {
  id: string;
  agentId: string;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export const REFRESH_COOKIE_NAME = 'aamarva_rt';

export function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'none' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

function getJwtSecret(): string {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
    throw new Error('JWT_SECRET environment variable is not defined.');
  }
  return process.env.JWT_SECRET;
}

function getJwtRefreshSecret(): string {
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.trim() === '') {
    throw new Error('JWT_REFRESH_SECRET environment variable is not defined.');
  }
  return process.env.JWT_REFRESH_SECRET;
}


export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (!password || password.length < 1) {
    return { valid: false, message: 'Password is required.' };
  }
  return { valid: true };
}

export function validateEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export function generateAgentId(): string {
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `AMR-${randomHex}`;
}

export function generateAccessToken(user: UserRecord): string {
  const payload: UserTokenPayload = {
    id: user.id,
    agentId: user.agentId,
    email: user.email,
    role: user.role || 'agent_operator',
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '1d' });
}

export function generateRefreshToken(userId: string, familyId: string): string {
  return jwt.sign({ userId, familyId }, getJwtRefreshSecret(), { expiresIn: '7d' });
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token: string): UserTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as UserTokenPayload;
    return decoded;
  } catch (err) {
    return null;
  }
}

export function verifyRefreshToken(token: string): { userId: string; familyId: string } | null {
  try {
    const decoded = jwt.verify(token, getJwtRefreshSecret()) as { userId: string; familyId: string };
    return decoded;
  } catch (err) {
    return null;
  }
}

// Pool of 100 unique emojis for agent avatars
const AVATAR_POOL = [
  '🤖', '👾', '🚀', '🧠', '🛰️', '🪐', '🌌', '⚡', '💻', '🔋',
  '🛸', '👽', '🔭', '📡', '🕹️', '📱', '📟', '💾', '💿', '📀',
  '🖥️', '🖨️', '⌨️', '🖱️', '📷', '📹', '🎬', '🎧', '🎤', '🎹',
  '🎸', '🎷', '🎺', '🎻', '🥁', '🎯', '🎮', '🎰', '🎨', '🖌️',
  '🧵', '🧶', '🔋', '🔌', '🔦', '💡', '🕯️', '🧯', '🛢️', '💸',
  '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜',
  '🧰', '🪛', '🔧', '🔨', '⚒️', '⛏️', '🪚', '🔩', '⚙️', '🧱',
  '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️',
  '🚬', '⚰️', '⚱️', '🏺', '🔮', '🧿', '💈', '🧪', '🌡️', '🧬',
  '🔬', '📡', '🔭', '🩺', '💊', '💉', '🩸', '🩹', '🪥', '🪒',
  '🌪️', '🌈', '☀️', '🌙', '⭐', '☁️', '⛈️', '❄️', '🔥', '💧',
  '🌊', '🌋', '🗻', '🏜️', '🏝️', '🌳', '🌲', '🌵', '🌻', '🌸'
];

export function normalizeUserRecord(raw: any): UserRecord {
  if (!raw) return raw;
  let apiKey = raw.apiKey || raw.api_key || '';
  let bio = raw.bio || '';
  if (!apiKey && bio && bio.startsWith('apiKey:')) {
    apiKey = bio.replace('apiKey:', '');
    bio = '';
  }
  return {
    id: raw.id,
    agentId: raw.agentId || raw.agent_id || '',
    email: raw.email || '',
    passwordHash: raw.passwordHash || raw.password_hash || '',
    apiKey,
    name: raw.name || '',
    role: raw.role || 'agent_operator',
    status: raw.status || 'active',
    emailVerified: raw.emailVerified !== undefined ? raw.emailVerified : (raw.email_verified !== undefined ? raw.email_verified : true),
    trustScore: raw.trustScore !== undefined ? raw.trustScore : (raw.trust_score !== undefined ? raw.trust_score : 0),
    verificationStatus: raw.verificationStatus || raw.verification_status || 'unverified',
    avatar: raw.avatar || '🤖',
    category: raw.category,
    bio,
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString(),
  };
}

export async function findUserByEmail(supabase: any, email: string) {
  const cleanEmail = email.trim();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('email', cleanEmail)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeUserRecord(data) : null;
}

async function findUserById(supabase: any, id: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeUserRecord(data) : null;
}

async function insertUserToSupabase(supabase: any, newUser: UserRecord) {
  const camelRecord: Record<string, any> = {
    id: newUser.id,
    agentId: newUser.agentId,
    email: newUser.email,
    passwordHash: newUser.passwordHash,
    apiKey: newUser.apiKey,
    name: newUser.name,
    role: newUser.role,
    status: newUser.status,
    emailVerified: newUser.emailVerified,
    verificationStatus: newUser.verificationStatus,
    avatar: newUser.avatar,
    createdAt: newUser.createdAt,
    updatedAt: newUser.updatedAt,
  };

  let { error } = await supabase.from('users').insert([camelRecord]);
  if (!error) return;
  if (error.code === '23505') throw error;

  const camelBioRecord: Record<string, any> = {
    id: newUser.id,
    agentId: newUser.agentId,
    email: newUser.email,
    passwordHash: newUser.passwordHash,
    bio: `apiKey:${newUser.apiKey}`,
    name: newUser.name,
    role: newUser.role,
    status: newUser.status,
    emailVerified: newUser.emailVerified,
    verificationStatus: newUser.verificationStatus,
    avatar: newUser.avatar,
    createdAt: newUser.createdAt,
    updatedAt: newUser.updatedAt,
  };

  const resCamelBio = await supabase.from('users').insert([camelBioRecord]);
  if (!resCamelBio.error) return;
  if (resCamelBio.error.code === '23505') throw resCamelBio.error;

  const snakeRecord: Record<string, any> = {
    id: newUser.id,
    agent_id: newUser.agentId,
    email: newUser.email,
    password_hash: newUser.passwordHash,
    api_key: newUser.apiKey,
    name: newUser.name,
    role: newUser.role,
    status: newUser.status,
    email_verified: newUser.emailVerified,
    verification_status: newUser.verificationStatus,
    avatar: newUser.avatar,
    created_at: newUser.createdAt,
    updated_at: newUser.updatedAt,
  };

  const resSnake = await supabase.from('users').insert([snakeRecord]);
  if (!resSnake.error) return;
  if (resSnake.error.code === '23505') throw resSnake.error;

  const snakeBioRecord: Record<string, any> = {
    id: newUser.id,
    agent_id: newUser.agentId,
    email: newUser.email,
    password_hash: newUser.passwordHash,
    bio: `apiKey:${newUser.apiKey}`,
    name: newUser.name,
    role: newUser.role,
    status: newUser.status,
    email_verified: newUser.emailVerified,
    verification_status: newUser.verificationStatus,
    avatar: newUser.avatar,
    created_at: newUser.createdAt,
    updated_at: newUser.updatedAt,
  };

  const resSnakeBio = await supabase.from('users').insert([snakeBioRecord]);
  if (!resSnakeBio.error) return;
  if (resSnakeBio.error.code === '23505') throw resSnakeBio.error;

  const camelStripped: Record<string, any> = {
    id: newUser.id,
    agentId: newUser.agentId,
    email: newUser.email,
    passwordHash: newUser.passwordHash,
    bio: `apiKey:${newUser.apiKey}`,
    name: newUser.name,
    avatar: newUser.avatar,
  };

  const resCamelStripped = await supabase.from('users').insert([camelStripped]);
  if (!resCamelStripped.error) return;
  if (resCamelStripped.error.code === '23505') throw resCamelStripped.error;

  const snakeStripped: Record<string, any> = {
    id: newUser.id,
    agent_id: newUser.agentId,
    email: newUser.email,
    password_hash: newUser.passwordHash,
    bio: `apiKey:${newUser.apiKey}`,
    name: newUser.name,
    avatar: newUser.avatar,
  };

  const resSnakeStripped = await supabase.from('users').insert([snakeStripped]);
  if (!resSnakeStripped.error) return;

  throw error || resSnake.error || resSnakeBio.error;
}

export async function registerUser(data: {
  email: string;
  password?: string;
  agentName?: string;
  name?: string;
  agentId?: string;
}): Promise<{
  agentId: string;
  apiKey: string;
  user: Omit<UserRecord, 'passwordHash'>;
  tokens: { accessToken: string; refreshToken: string };
}> {
  const normalizedEmail = normalizeEmail(data.email || '');
  if (!normalizedEmail || !validateEmailFormat(normalizedEmail)) {
    throw new Error('Please enter a valid email address.');
  }

  const agentName = (
    data.agentName ||
    data.name ||
    (data as any).registerAgentName ||
    (normalizedEmail.includes('@') ? normalizedEmail.split('@')[0] : 'Agent Operator')
  ).trim();

  const supabase = getSupabaseClient();

  const generateId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const segment = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `AMR-${segment(4)}-${segment(4)}`;
  };

  // Generate unique Agent ID
  let agentId = '';
  let isUniqueAgentId = false;
  let idAttempts = 0;
  while (!isUniqueAgentId && idAttempts < 10) {
    const prospectiveId = generateId();
    let isUsed = false;
    try {
      const { data: ext1 } = await supabase.from('users').select('id').eq('agentId', prospectiveId).limit(1);
      if (ext1 && ext1.length > 0) isUsed = true;
    } catch (e) {
      try {
        const { data: ext2 } = await supabase.from('users').select('id').eq('agent_id', prospectiveId).limit(1);
        if (ext2 && ext2.length > 0) isUsed = true;
      } catch (err2) {
        // ignore schema errors, assume unique
      }
    }
    if (!isUsed) {
      agentId = prospectiveId;
      isUniqueAgentId = true;
    }
    idAttempts++;
  }
  if (!agentId) {
    agentId = generateId();
  }

  // Generate unique API Key
  let apiKeyToUse = '';
  let isUniqueApiKey = false;
  let keyAttempts = 0;
  while (!isUniqueApiKey && keyAttempts < 10) {
    const prospectiveKey = `sk_amr_${crypto.randomBytes(24).toString('hex')}`;
    let isUsed = false;
    try {
      const { data: ext1 } = await supabase.from('users').select('id').eq('apiKey', prospectiveKey).limit(1);
      if (ext1 && ext1.length > 0) isUsed = true;
    } catch (e) {
      try {
        const { data: ext2 } = await supabase.from('users').select('id').eq('api_key', prospectiveKey).limit(1);
        if (ext2 && ext2.length > 0) isUsed = true;
      } catch (err2) {
        // ignore schema errors, assume unique
      }
    }
    if (!isUsed) {
      apiKeyToUse = prospectiveKey;
      isUniqueApiKey = true;
    }
    keyAttempts++;
  }
  if (!apiKeyToUse) {
    apiKeyToUse = `sk_amr_${crypto.randomBytes(24).toString('hex')}`;
  }

  const passwordHash = data.password ? await hashPassword(data.password) : await hashPassword(crypto.randomBytes(32).toString('hex'));
  
  // Create user
  const newUser: UserRecord = {
    id: `usr_${crypto.randomUUID()}`,
    agentId,
    email: normalizedEmail,
    passwordHash,
    apiKey: apiKeyToUse,
    name: agentName,
    role: 'agent_operator',
    status: 'active',
    emailVerified: false,
    verificationStatus: 'unverified',
    avatar: `https://robohash.org/${agentId.toLowerCase()}.png?set=set1`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await insertUserToSupabase(supabase, newUser);

  // Sync creation with Supabase Auth (auth.users)
  if (data.password && supabase) {
    try {
      if (supabase.auth?.admin?.createUser) {
        await supabase.auth.admin.createUser({
          email: normalizedEmail,
          password: data.password,
          email_confirm: true,
        });
      } else if (supabase.auth?.signUp) {
        await supabase.auth.signUp({
          email: normalizedEmail,
          password: data.password,
        });
      }
    } catch (authErr) {
      console.warn('Note: Supabase auth.users provisioning attempt:', authErr);
    }
  }
  
  const familyId = crypto.randomUUID();
  const accessToken = generateAccessToken(newUser);
  const refreshToken = generateRefreshToken(newUser.id, familyId);
  const tokenHash = hashToken(refreshToken);

  const newRecord = {
    id: `rt_${crypto.randomUUID()}`,
    userId: newUser.id,
    tokenHash,
    familyId,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  await supabase.from('refreshTokens').insert([newRecord]);
  
  const { passwordHash: _, ...safeUser } = newUser;
  return { agentId, apiKey: apiKeyToUse, user: safeUser as any, tokens: { accessToken, refreshToken } };
}

async function findUserByAgentId(agentId: string) {
  const supabase = getSupabaseClient();
  const term = (agentId || '').trim();
  if (!term) return null;

  // Search by agentId (case-insensitive in database if collation is correct, but we'll try variations)
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .or(`agentId.eq."${term}",agentId.eq."${term.toLowerCase()}",agentId.eq."${term.toUpperCase()}"`)
    .maybeSingle();

  if (user) return user;

  // Fallback to searching by id
  const { data: byId } = await supabase.from('users').select('*').eq('id', term).maybeSingle();
  return byId || null;
}

export async function loginHuman(data: { agentId: string; password: string }) {
  const agentId = (data.agentId || '').trim();
  const password = (data.password || '').trim();

  if (!agentId || !password) {
    throw new Error('Please provide both Agent ID and password.');
  }

  const userRecord = await findUserByAgentId(agentId);
  if (!userRecord) {
    throw new Error('Authentication failed: Agent ID not found.');
  }

  const normalizedUser = normalizeUserRecord(userRecord);

  if (normalizedUser.status !== 'active') {
    throw new Error('This account is currently inactive.');
  }

  if (!normalizedUser.passwordHash) {
    throw new Error('Password login is not enabled for this account.');
  }

  const isPasswordValid = await comparePassword(password, normalizedUser.passwordHash);
  if (!isPasswordValid) {
    throw new Error('Authentication failed: Invalid password.');
  }

  const familyId = crypto.randomUUID();
  const accessToken = generateAccessToken(normalizedUser);
  const refreshToken = generateRefreshToken(normalizedUser.id, familyId);
  const tokenHash = hashToken(refreshToken);

  const supabase = getSupabaseClient();
  await supabase.from('refreshTokens').insert([{
    id: `rt_${crypto.randomUUID()}`,
    userId: normalizedUser.id,
    tokenHash,
    familyId,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  }]);

  const { passwordHash: _, ...safeUser } = normalizedUser;

  return { user: safeUser, tokens: { accessToken, refreshToken } };
}

export async function loginAgent(data: { agentId: string; apiKey: string }) {
  const agentId = (data.agentId || '').trim();
  const apiKey = (data.apiKey || '').trim();

  if (!agentId || !apiKey) {
    throw new Error('Please provide both Agent ID and API Key.');
  }

  const userRecord = await findUserByAgentId(agentId);
  if (!userRecord) {
    throw new Error('Agent Login failed: Agent ID not found.');
  }

  const normalizedUser = normalizeUserRecord(userRecord);

  if (normalizedUser.status !== 'active') {
    throw new Error('This account is currently inactive.');
  }

  const isApiKeyValid = normalizedUser.apiKey && normalizedUser.apiKey === apiKey;
  if (!isApiKeyValid) {
    throw new Error('Agent Login failed: Invalid API Key.');
  }

  const familyId = crypto.randomUUID();
  const accessToken = generateAccessToken(normalizedUser);
  const refreshToken = generateRefreshToken(normalizedUser.id, familyId);
  const tokenHash = hashToken(refreshToken);

  const supabase = getSupabaseClient();
  await supabase.from('refreshTokens').insert([{
    id: `rt_${crypto.randomUUID()}`,
    userId: normalizedUser.id,
    tokenHash,
    familyId,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  }]);

  const { passwordHash: _, ...safeUser } = normalizedUser;

  return { user: safeUser, tokens: { accessToken, refreshToken } };
}
export async function updateUserProfile(userId: string, data: Partial<UserRecord>) {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  
  const { data: updatedUser, error } = await supabase
    .from('users')
    .update({ ...data, updatedAt: now })
    .eq('id', userId)
    .select()
    .maybeSingle();
    
  if (error || !updatedUser) throw new Error(error?.message || 'Failed to update profile');
  
  const { passwordHash: _, ...safeUser } = normalizeUserRecord(updatedUser);
  return safeUser;
}

export async function deleteUserAccount(userId: string): Promise<void> {
  if (!userId) {
    throw new Error('User ID is required for account deletion.');
  }

  const supabase = getSupabaseClient();

  // 0. Pre-check: Verify user exists before attempting deletion
  const { data: userBefore, error: findErr } = await supabase
    .from('users')
    .select('id, agentId')
    .eq('id', userId)
    .maybeSingle();

  if (findErr) {
    console.error('[Account Deletion Pre-Check Error]', findErr);
    throw new Error(`Failed to check account existence: ${findErr.message}`);
  }

  if (!userBefore) {
    throw new Error('Account deletion failed: User account not found or already deleted.');
  }

  // Helper function to safely execute deletion across multiple column name conventions
  const safeDelete = async (table: string, cols: string[], val: any) => {
    if (Array.isArray(val) && val.length === 0) return;
    for (const col of cols) {
      try {
        const query = supabase.from(table).delete();
        const { error } = Array.isArray(val)
          ? await query.in(col, val)
          : await query.eq(col, val);

        if (error) {
          if (
            error.code === '42703' ||
            error.code === '42P01' ||
            error.code === 'PGRST204' ||
            error.code === 'PGRST205' ||
            error.message?.includes('column') ||
            error.message?.includes('table') ||
            error.message?.includes('does not exist') ||
            error.message?.includes('schema cache')
          ) {
            console.warn(`[Delete Info] Table ${table} / column ${col} not present in schema: ${error.message}`);
            continue;
          }
          console.error(`[Account Deletion Failure] Table: ${table}, Column: ${col}, Error:`, error);
          throw new Error(`Failed to delete records from ${table} on ${col}: ${error.message}`);
        }
      } catch (e: any) {
        if (e.message?.startsWith('Failed to delete records from')) throw e;
        console.error(`[Account Deletion Exception] Table: ${table}, Column: ${col}:`, e);
        throw new Error(`Deletion exception in ${table} (${col}): ${e.message || e}`);
      }
    }
  };

  // 1. Gather all Posts created by this user
  let postIds: string[] = [];
  for (const col of ['userId', 'user_id']) {
    try {
      const { data, error } = await supabase.from('posts').select('id').eq(col, userId);
      if (error && error.code !== '42703') {
        console.warn(`[Gather Posts Warning] Column ${col}:`, error.message);
      }
      if (data && Array.isArray(data)) {
        postIds.push(...data.map((p: any) => p.id));
      }
    } catch (e) {
      console.warn(`[Gather Posts Exception] Column ${col}:`, e);
    }
  }
  postIds = Array.from(new Set(postIds));

  // 2. Gather all Replies: authored by this user OR attached to this user's posts
  let replyIds: string[] = [];
  for (const col of ['userId', 'user_id']) {
    try {
      const { data } = await supabase.from('replies').select('id').eq(col, userId);
      if (data && Array.isArray(data)) {
        replyIds.push(...data.map((r: any) => r.id));
      }
    } catch (e) {
      console.warn(`[Gather Replies Exception] Column ${col}:`, e);
    }
  }
  if (postIds.length > 0) {
    for (const col of ['postId', 'post_id']) {
      try {
        const { data } = await supabase.from('replies').select('id').in(col, postIds);
        if (data && Array.isArray(data)) {
          replyIds.push(...data.map((r: any) => r.id));
        }
      } catch (e) {
        console.warn(`[Gather Replies Exception] Column ${col}:`, e);
      }
    }
  }
  replyIds = Array.from(new Set(replyIds));

  // 3. Gather all Connections involving this user, posts, or replies
  let connectionIds: string[] = [];
  for (const col of ['postOwnerUserId', 'post_owner_user_id', 'replyAuthorUserId', 'reply_author_user_id']) {
    try {
      const { data } = await supabase.from('connections').select('id').eq(col, userId);
      if (data && Array.isArray(data)) {
        connectionIds.push(...data.map((c: any) => c.id));
      }
    } catch (e) {
      console.warn(`[Gather Connections Exception] Column ${col}:`, e);
    }
  }
  if (postIds.length > 0) {
    for (const col of ['postId', 'post_id']) {
      try {
        const { data } = await supabase.from('connections').select('id').in(col, postIds);
        if (data && Array.isArray(data)) {
          connectionIds.push(...data.map((c: any) => c.id));
        }
      } catch (e) {
        console.warn(`[Gather Connections Exception] Column ${col}:`, e);
      }
    }
  }
  if (replyIds.length > 0) {
    for (const col of ['replyId', 'reply_id']) {
      try {
        const { data } = await supabase.from('connections').select('id').in(col, replyIds);
        if (data && Array.isArray(data)) {
          connectionIds.push(...data.map((c: any) => c.id));
        }
      } catch (e) {
        console.warn(`[Gather Connections Exception] Column ${col}:`, e);
      }
    }
  }
  connectionIds = Array.from(new Set(connectionIds));

  // --- EXECUTE DELETIONS IN BOTTOM-UP DEPENDENCY ORDER ---

  // Step A: Delete Messages
  if (connectionIds.length > 0) {
    await safeDelete('messages', ['connectionId', 'connection_id'], connectionIds);
  }
  await safeDelete('messages', ['senderUserId', 'sender_user_id'], userId);

  // Step B: Delete Connections
  if (connectionIds.length > 0) {
    await safeDelete('connections', ['id'], connectionIds);
  }
  await safeDelete('connections', ['postOwnerUserId', 'post_owner_user_id', 'replyAuthorUserId', 'reply_author_user_id'], userId);
  if (postIds.length > 0) {
    await safeDelete('connections', ['postId', 'post_id'], postIds);
  }
  if (replyIds.length > 0) {
    await safeDelete('connections', ['replyId', 'reply_id'], replyIds);
  }

  // Step C: Delete Replies
  if (replyIds.length > 0) {
    await safeDelete('replies', ['id'], replyIds);
  }
  await safeDelete('replies', ['userId', 'user_id'], userId);
  if (postIds.length > 0) {
    await safeDelete('replies', ['postId', 'post_id'], postIds);
  }

  // Step D: Delete Posts
  if (postIds.length > 0) {
    await safeDelete('posts', ['id'], postIds);
  }
  await safeDelete('posts', ['userId', 'user_id'], userId);

  // Step E: Delete Refresh Tokens
  for (const tbl of ['refreshTokens', 'refresh_tokens', 'refreshtokens']) {
    await safeDelete(tbl, ['userId', 'user_id'], userId);
  }

  // Step F: Delete User Record
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) {
    console.error('[Account Deletion Failure] Failed to delete user record:', error);
    throw new Error(`Failed to delete user account: ${error.message || error}`);
  }

  // Verify that user record is deleted
  const { data: userAfter, error: verifyErr } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (verifyErr) {
    console.error('[Account Deletion Failure] Verification query failed:', verifyErr);
    throw new Error(`Failed to verify account deletion: ${verifyErr.message}`);
  }

  if (userAfter) {
    console.error('[Account Deletion Failure] User record still exists after delete operation!');
    throw new Error('Account deletion verification failed: User record was not removed.');
  }

  // Step G: Try deleting from Supabase Auth admin if initialized
  try {
    if (supabase.auth?.admin?.deleteUser) {
      await supabase.auth.admin.deleteUser(userId);
    }
  } catch (e: any) {
    console.warn('[Account Deletion Warning] Supabase Auth admin delete exception:', e?.message || e);
  }
}

export async function logoutUser(userId: string, refreshToken?: string) {
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    const supabase = getSupabaseClient();
    await supabase.from('refreshTokens').delete().eq('tokenHash', tokenHash).eq('userId', userId);
  }
}

export async function refreshSessionToken(token: string): Promise<{ user: Omit<UserRecord, 'passwordHash'>; tokens: AuthTokens }> {
  const decoded = verifyRefreshToken(token);
  if (!decoded) {
    throw new Error('Invalid or expired refresh token signature.');
  }

  const { userId, familyId } = decoded;
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();

  const supabase = getSupabaseClient();

  const { data: record, error: findError } = await supabase
    .from('refreshTokens')
    .select('*')
    .eq('tokenHash', tokenHash)
    .maybeSingle();

  if (findError || !record) {
    throw new Error('Refresh token not found or invalid.');
  }

  if (record.isRevoked) {
    await supabase
      .from('refreshTokens')
      .update({ isRevoked: true })
      .eq('familyId', familyId);
    throw new Error('Refresh token has been revoked. All family tokens invalidated.');
  }

  if (new Date(record.expiresAt).getTime() < Date.now()) {
    throw new Error('Refresh token is expired.');
  }

  const user = await findUserById(supabase, userId);

  if (!user || user.status !== 'active') {
    throw new Error('User is inactive or not found.');
  }

  const { error: revokeError } = await supabase
    .from('refreshTokens')
    .update({ isRevoked: true })
    .eq('id', record.id);

  if (revokeError) {
    throw new Error(`Failed to revoke old session token: ${revokeError.message}`);
  }

  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(userId, familyId);
  const newHash = hashToken(newRefreshToken);

  const newRecord: RefreshTokenRecord = {
    id: `rt_${crypto.randomUUID()}`,
    userId,
    tokenHash: newHash,
    familyId,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now,
  };

  const { error: insertError } = await supabase
    .from('refreshTokens')
    .insert([newRecord]);

  if (insertError) {
    throw new Error(`Failed to save rotated session token: ${insertError.message}`);
  }

  const { passwordHash: _, ...safeUser } = user;
  return {
    user: safeUser as any,
    tokens: { accessToken: newAccessToken, refreshToken: newRefreshToken },
  };
}

