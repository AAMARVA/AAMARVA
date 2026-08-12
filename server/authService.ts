import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserRecord, RefreshTokenRecord } from './db.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';
import { sendEmailVerification, sendPasswordResetEmail } from './emailService.js';
import { config } from './config.js';


export interface UserTokenPayload {
  id: string;
  agentId: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export const REFRESH_COOKIE_NAME = 'aamarva_rt';

export const DEFAULT_BIO = "Hello World";

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

export async function hashApiKey(apiKey: string): Promise<string> {
  const saltRounds = 10;
  return await bcrypt.hash(apiKey, saltRounds);
}

export async function compareApiKey(apiKey: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(apiKey, hash);
}

export function computeApiKeyFingerprint(apiKey: string): string {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) return '';
  const secret = process.env.API_KEY_HMAC_SECRET;
  if (!secret) {
    throw new Error('Critical configuration error: API_KEY_HMAC_SECRET environment variable is missing.');
  }
  return crypto.createHmac('sha256', secret).update(cleanKey).digest('hex');
}

let authUsersCache: any[] | null = null;
let lastCacheFetchTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

export function invalidateAuthCache(): void {
  authUsersCache = null;
  lastCacheFetchTime = 0;
}

async function getAuthUsersList(forceRefresh = false): Promise<any[]> {
  const now = Date.now();
  if (!forceRefresh && authUsersCache && (now - lastCacheFetchTime < CACHE_TTL_MS)) {
    return authUsersCache;
  }

  const supabase = getSupabaseClient();
  const { data: { users: authUsers }, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr || !authUsers) {
    console.error('getAuthUsersList: Failed to list auth users:', authErr);
    return authUsersCache || [];
  }

  authUsersCache = authUsers;
  lastCacheFetchTime = now;
  return authUsers;
}

export function generateAgentId(): string {
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `AMR-${randomHex}`;
}

export function generateApiKey(): string {
  return `sk_amr_${crypto.randomBytes(24).toString('hex')}`;
}

export function generateAccessToken(user: UserRecord): string {
  const payload: UserTokenPayload = {
    id: user.id,
    agentId: user.agentId,
    email: user.email,
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

export function normalizeUserRecord(raw: any, authUser?: any): UserRecord {
  if (!raw) return raw;
  
  // Authoritative apiKeyHash source: auth.user.app_metadata (Admin-only)
  const apiKeyHash = authUser?.app_metadata?.apiKeyHash || '';

  return {
    id: raw.id,
    agentId: raw.agentId || raw.agent_id || '',
    email: raw.email || '',
    passwordHash: raw.passwordHash || raw.password_hash || '',
    apiKey: apiKeyHash, // Use dedicated hash field from metadata
    name: raw.name || '',
    status: raw.status || 'active',
    emailVerified: raw.emailVerified !== undefined ? raw.emailVerified : (raw.email_verified !== undefined ? raw.email_verified : true),
    trustScore: raw.trustScore !== undefined ? raw.trustScore : (raw.trust_score !== undefined ? raw.trust_score : 0),
    verificationStatus: raw.verificationStatus || raw.verification_status || 'unverified',
    avatar: raw.avatar || '🤖',
    bio: (raw.bio || raw.agent_bio || '').trim() || DEFAULT_BIO,
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
  // Primary attempt: Use dedicated apiKey column (if it ever exists)
  const camelRecord: Record<string, any> = {
    id: newUser.id,
    agentId: newUser.agentId,
    email: newUser.email,
    passwordHash: newUser.passwordHash,
    name: newUser.name,
    role: 'agent_operator',
    status: newUser.status,
    emailVerified: newUser.emailVerified,
    verificationStatus: newUser.verificationStatus,
    avatar: newUser.avatar,
    bio: newUser.bio || DEFAULT_BIO,
    createdAt: newUser.createdAt,
    updatedAt: newUser.updatedAt,
  };

  const { error } = await supabase.from('users').insert([camelRecord]);
  if (error && error.code === '23505') throw error;
  if (error) {
    // If dedicated column fails, we rely on user_metadata which is handled in registerUser
    // but we still try snake_case for the profile part
    const snakeRecord: Record<string, any> = {
      id: newUser.id,
      agent_id: newUser.agentId,
      email: newUser.email,
      password_hash: newUser.passwordHash,
      name: newUser.name,
      role: 'agent_operator',
      status: newUser.status,
      email_verified: newUser.emailVerified,
      verification_status: newUser.verificationStatus,
      avatar: newUser.avatar,
      bio: newUser.bio || DEFAULT_BIO,
      created_at: newUser.createdAt,
      updated_at: newUser.updatedAt,
    };
    const resSnake = await supabase.from('users').insert([snakeRecord]);
    if (resSnake.error && resSnake.error.code === '23505') throw resSnake.error;
  }
}

export async function registerUser(data: {
  email: string;
  password?: string;
  agentName?: string;
  name?: string;
  agentId?: string;
  bio?: string;
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
  const apiKeyToUse = generateApiKey();

  const passwordHash = data.password ? await hashPassword(data.password) : await hashPassword(crypto.randomBytes(32).toString('hex'));
  
  // Create user
  const apiKeyHash = await hashApiKey(apiKeyToUse);
  const newUser: UserRecord = {
    id: `usr_${crypto.randomUUID()}`,
    agentId,
    email: normalizedEmail,
    passwordHash,
    apiKey: apiKeyHash,
    name: agentName,
    status: 'active',
    emailVerified: false,
    verificationStatus: 'unverified',
    avatar: `https://robohash.org/${agentId.toLowerCase()}.png?set=set1`,
    bio: (data.bio || '').trim() || DEFAULT_BIO,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await insertUserToSupabase(supabase, newUser);

  // Sync creation with Supabase Auth (auth.users) and store apiKeyHash and apiKeyFingerprint in metadata
  if (supabase) {
    try {
      const apiKeyFingerprint = computeApiKeyFingerprint(apiKeyToUse);
      if (supabase.auth?.admin?.createUser) {
        await supabase.auth.admin.createUser({
          email: normalizedEmail,
          password: data.password || crypto.randomBytes(32).toString('hex'),
          email_confirm: true,
          app_metadata: { apiKeyHash, apiKeyFingerprint }
        });
      } else if (supabase.auth?.signUp) {
        const { data: signUpData } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: data.password || crypto.randomBytes(32).toString('hex')
        });
        if (signUpData?.user?.id && supabase.auth?.admin?.updateUserById) {
           await supabase.auth.admin.updateUserById(signUpData.user.id, {
             app_metadata: { apiKeyHash, apiKeyFingerprint }
           });
        }
      }
      invalidateAuthCache();
    } catch (authErr) {
      console.warn('Note: Supabase auth.users provisioning attempt failed.');
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
  
  const { passwordHash: _, apiKey: __, ...safeUser } = newUser;
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

export async function findUserByApiKey(apiKey: string) {
  const supabase = getSupabaseClient();
  const term = (apiKey || '').trim();
  if (!term) return null;

  const targetFingerprint = computeApiKeyFingerprint(term);
  let authUsers = await getAuthUsersList();

  // 1. Fast path: Find candidate auth user by HMAC fingerprint
  let candidateUser = authUsers.find(
    (u) => u.app_metadata?.apiKeyFingerprint === targetFingerprint
  );

  // If candidate not found in cache, force refresh cache from Supabase once
  if (!candidateUser) {
    authUsers = await getAuthUsersList(true);
    candidateUser = authUsers.find(
      (u) => u.app_metadata?.apiKeyFingerprint === targetFingerprint
    );
  }

  if (candidateUser) {
    const hash = candidateUser.app_metadata?.apiKeyHash || '';
    if (!hash) return null;

    let isMatch = false;
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
      isMatch = await compareApiKey(term, hash);
    } else {
      isMatch = (hash === term);
    }

    if (isMatch) {
      const { data: pUser } = await supabase
        .from('users')
        .select('*')
        .ilike('email', candidateUser.email || '')
        .maybeSingle();

      return pUser ? normalizeUserRecord(pUser, candidateUser) : null;
    }
    return null;
  }

  // 2. Backward compatibility fallback for legacy API keys missing fingerprint
  const legacyUsers = authUsers.filter((u) => !u.app_metadata?.apiKeyFingerprint);
  for (const aUser of legacyUsers) {
    const hash = aUser.app_metadata?.apiKeyHash || '';
    if (!hash) continue;

    let isMatch = false;
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
      isMatch = await compareApiKey(term, hash);
    } else {
      isMatch = (hash === term);
    }

    if (isMatch) {
      // Auto-backfill fingerprint for legacy key
      try {
        await supabase.auth.admin.updateUserById(aUser.id, {
          app_metadata: {
            ...aUser.app_metadata,
            apiKeyFingerprint: targetFingerprint,
          },
        });
        invalidateAuthCache();
      } catch (backfillErr) {
        console.warn('Failed to backfill apiKeyFingerprint for legacy user:', backfillErr);
      }

      const { data: pUser } = await supabase
        .from('users')
        .select('*')
        .ilike('email', aUser.email || '')
        .maybeSingle();

      return pUser ? normalizeUserRecord(pUser, aUser) : null;
    }
  }

  return null;
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

  const { passwordHash: _, apiKey: __, ...safeUser } = normalizedUser;

  return { user: safeUser, tokens: { accessToken, refreshToken } };
}

export async function loginAgent(data: { agentId: string; apiKey: string }) {
  const agentId = (data.agentId || '').trim();
  const apiKey = (data.apiKey || '').trim();

  if (!agentId || !apiKey) {
    throw new Error('Please provide both Agent ID and API Key.');
  }

  const supabase = getSupabaseClient();
  const userRecord = await findUserByAgentId(agentId);
  if (!userRecord) {
    throw new Error('Agent Login failed: Agent ID not found.');
  }

  // Fetch Supabase Auth user to get apiKeyHash from metadata (prefer app_metadata)
  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
  const authUser = authUsers.find(u => u.email?.toLowerCase() === userRecord.email?.toLowerCase());

  const normalizedUser = normalizeUserRecord(userRecord, authUser);

  if (normalizedUser.status !== 'active') {
    throw new Error('This account is currently inactive.');
  }

  let isApiKeyValid = false;
  if (normalizedUser.apiKey.startsWith('$2a$') || normalizedUser.apiKey.startsWith('$2b$')) {
    isApiKeyValid = await compareApiKey(apiKey, normalizedUser.apiKey);
  } else {
    isApiKeyValid = normalizedUser.apiKey === apiKey;
    if (isApiKeyValid) {
      const hashedKey = await hashApiKey(apiKey);
      const fingerprint = computeApiKeyFingerprint(apiKey);
      
      // Update app_metadata in Supabase Auth (Admin-only storage)
      if (authUser) {
        await supabase.auth.admin.updateUserById(authUser.id, {
          app_metadata: { ...authUser.app_metadata, apiKeyHash: hashedKey, apiKeyFingerprint: fingerprint }
        });
        invalidateAuthCache();
      }
    }
  }

  if (!isApiKeyValid) {
    throw new Error('Agent Login failed: Invalid API Key.');
  }

  // Backfill fingerprint into app_metadata if missing
  if (authUser && !authUser.app_metadata?.apiKeyFingerprint) {
    const fingerprint = computeApiKeyFingerprint(apiKey);
    try {
      await supabase.auth.admin.updateUserById(authUser.id, {
        app_metadata: { ...authUser.app_metadata, apiKeyFingerprint: fingerprint }
      });
      invalidateAuthCache();
    } catch (err) {
      console.warn('Failed to update apiKeyFingerprint on agent login:', err);
    }
  }

  const familyId = crypto.randomUUID();
  const accessToken = generateAccessToken(normalizedUser);
  const refreshToken = generateRefreshToken(normalizedUser.id, familyId);
  const tokenHash = hashToken(refreshToken);

  await supabase.from('refreshTokens').insert([{
    id: `rt_${crypto.randomUUID()}`,
    userId: normalizedUser.id,
    tokenHash,
    familyId,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  }]);

  const { passwordHash: _, apiKey: __, ...safeUser } = normalizedUser;

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
  
  const { passwordHash: _, apiKey: __, ...safeUser } = normalizeUserRecord(updatedUser);
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
    .select('id, agentId, email')
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
      }
      if (data && Array.isArray(data)) {
        postIds.push(...data.map((p: any) => p.id));
      }
    } catch (e) {
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
    if (supabase.auth?.admin?.deleteUser && userBefore?.email) {
      const targetEmail = userBefore.email.toLowerCase();
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      });
      if (listError) {
        console.error('[Account Deletion Error] Failed to list Auth users:', listError);
        throw new Error(`Failed to list Auth users to complete deletion: ${listError.message}`);
      }
      if (listData?.users) {
        const authUser = listData.users.find(u => u.email?.toLowerCase() === targetEmail);
        if (authUser) {
          const { error: deleteError } = await supabase.auth.admin.deleteUser(authUser.id);
          if (deleteError) {
            console.error('[Account Deletion Error] Failed to delete Supabase Auth user:', deleteError);
            throw new Error(`Failed to delete corresponding Auth user account: ${deleteError.message}`);
          } else {
            console.log(`[Account Deletion] Successfully deleted Supabase Auth user: ${targetEmail} (Auth ID: ${authUser.id})`);
          }
        } else {
          console.log(`[Account Deletion Warning] Corresponding Auth user for email ${targetEmail} not found in Supabase Auth list.`);
        }
      }
    } else if (userBefore?.email) {
      throw new Error('Supabase Auth admin client is not initialized or does not have deleteUser permissions.');
    }
  } catch (e: any) {
    console.error('[Account Deletion Error] Supabase Auth admin delete exception:', e?.message || e);
    throw e;
  }
}

export async function logoutUser(userId: string, refreshToken?: string) {
  if (refreshToken) {
    try {
      const tokenHash = hashToken(refreshToken);
      const supabase = getSupabaseClient();
      await supabase.from('refreshTokens').delete().eq('tokenHash', tokenHash).eq('userId', userId);
    } catch (e) {
      console.error(`[Logout] Error deleting token: ${e}`);
    }
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

  const { passwordHash: _, apiKey: __, ...safeUser } = user;
  return {
    user: safeUser as any,
    tokens: { accessToken: newAccessToken, refreshToken: newRefreshToken },
  };
}

/**
 * Rotates the agent's API key.
 * Requires password verification.
 */
export async function rotateAgentApiKey(userId: string, password: string) {
  const supabase = getSupabaseClient();

  // 1. Find user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (userError || !user) throw new Error('User not found.');

  // Verify password
  if (!user.passwordHash) {
    throw new Error('Password login is not enabled for this account.');
  }
  const isPasswordValid = await comparePassword(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new Error('Authentication failed: Invalid password.');
  }

  // 3. Generate new API Key
  const newApiKey = generateApiKey();
  const apiKeyHash = await bcrypt.hash(newApiKey, 12);
  const apiKeyFingerprint = computeApiKeyFingerprint(newApiKey);

  // 4. Find the Supabase Auth User ID (UUID) by email
  // The users table ID (usr_...) is NOT the Supabase Auth UUID.
  const { data: { users: authUsers }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw new Error('Failed to access auth system.');

  const authUser = authUsers.find(u => u.email?.toLowerCase() === user.email.toLowerCase());
  if (!authUser) throw new Error('Auth account not found for this user.');

  // 5. Update Supabase Auth app_metadata (authoritative storage) using the UUID
  const { error: authUpdateError } = await supabase.auth.admin.updateUserById(authUser.id, {
    app_metadata: { ...authUser.app_metadata, apiKeyHash, apiKeyFingerprint }
  });

  if (authUpdateError) {
    console.error('Failed to update apiKeyHash in Supabase Auth:', authUpdateError);
    throw new Error('Failed to update agent credentials.');
  }

  invalidateAuthCache();

  // 6. Update the public users table apiKey (hashed) for redundancy/sync
  await supabase.from('users').update({ apiKey: apiKeyHash, updatedAt: new Date().toISOString() }).eq('id', user.id);

  return { apiKey: newApiKey };
}

/**
 * Initiates an email change request.
 * 1. Validates new email.
 * 2. Stores hashed token in app_metadata.
 * 3. Sends verification email to the OLD address.
 */
export async function requestEmailChange(userId: string, data: { newEmail: string; password?: string }, customAppUrl?: string) {
  const supabase = getSupabaseClient();
  const normalizedNewEmail = normalizeEmail(data.newEmail);

  if (!validateEmailFormat(normalizedNewEmail)) {
    throw new Error('Invalid email format.');
  }

  // 1. Find current user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (userError || !user) throw new Error('User not found.');
  if (normalizeEmail(user.email) === normalizedNewEmail) {
    throw new Error('New email is identical to current email.');
  }

  // 3. Check if new email is already taken
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .ilike('email', normalizedNewEmail)
    .maybeSingle();
  
  if (existingUser) {
    throw new Error('Email address already in use.');
  }

  // 4. Generate verification token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

  // 5. Store in Supabase Auth app_metadata
  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
  const authUser = authUsers.find(u => u.email?.toLowerCase() === user.email.toLowerCase());
  if (!authUser) throw new Error('Auth account not found.');

  const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
    app_metadata: {
      ...authUser.app_metadata,
      pendingEmailChange: {
        newEmail: normalizedNewEmail,
        tokenHash,
        expiresAt
      }
    }
  });

  if (updateError) throw new Error('Failed to create verification request.');

  // 6. Send email to OLD address
  const appUrl = customAppUrl || process.env.APP_URL || config.appUrl || 'https://aamarva.com';
  await sendEmailVerification(user.email, normalizedNewEmail, token, appUrl);

  return { message: 'Verification email sent to your current address.' };
}

/**
 * Verifies and applies an email change.
 */
export async function verifyEmailChange(token: string) {
  const supabase = getSupabaseClient();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // 1. Find user with this pending token
  const { data: { users: authUsers }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw new Error('Failed to process verification.');

  let targetAuthUser = null;
  let pendingData = null;

  for (const u of authUsers) {
    const p = u.app_metadata?.pendingEmailChange;
    if (p && p.tokenHash === tokenHash) {
      targetAuthUser = u;
      pendingData = p;
      break;
    }
  }

  if (!targetAuthUser || !pendingData) {
    throw new Error('Invalid or expired verification token.');
  }

  // 2. Check expiration
  if (new Date(pendingData.expiresAt).getTime() < Date.now()) {
    // Clear expired data
    await supabase.auth.admin.updateUserById(targetAuthUser.id, {
      app_metadata: { ...targetAuthUser.app_metadata, pendingEmailChange: null }
    });
    throw new Error('Verification token has expired.');
  }

  // 3. Final availability check (someone else might have taken it in the meantime)
  const { data: collision } = await supabase
    .from('users')
    .select('id')
    .ilike('email', pendingData.newEmail)
    .maybeSingle();
  
  if (collision) {
    throw new Error('Email address is no longer available.');
  }

  const oldEmail = targetAuthUser.email;

  // 4. Atomic Update with Rollback on failure
  // a. Update public users table
  const { error: dbError } = await supabase
    .from('users')
    .update({ 
      email: pendingData.newEmail, 
      updatedAt: new Date().toISOString() 
    })
    .ilike('email', oldEmail || '');

  if (dbError) throw new Error('Failed to update account record.');

  // b. Update Supabase Auth email and clear pending metadata
  const { error: authError } = await supabase.auth.admin.updateUserById(targetAuthUser.id, {
    email: pendingData.newEmail,
    email_confirm: true,
    app_metadata: { ...targetAuthUser.app_metadata, pendingEmailChange: null }
  });

  if (authError) {
    console.error('Failed to update Supabase Auth email, rolling back database email update:', authError);
    // Rollback DB update
    const { error: rollbackError } = await supabase
      .from('users')
      .update({ 
        email: oldEmail, 
        updatedAt: new Date().toISOString() 
      })
      .ilike('email', pendingData.newEmail);

    if (rollbackError) {
      console.error('CRITICAL: Rollback of database email update failed!', rollbackError);
    }

    throw new Error('Failed to finalize email update in auth system.');
  }

  return { email: pendingData.newEmail };
}

/**
 * Handles forgot password request:
 * 1. Normalize email.
 * 2. Query Aamarva `users` table.
 * 3. If user DOES NOT exist: return generic success message without sending email or creating tokens (prevents account enumeration).
 * 4. If user DOES exist:
 *    - Invalidate any previous active reset tokens for this user in `password_reset_tokens`.
 *    - Generate secure random token.
 *    - Hash token using SHA-256.
 *    - Store in `password_reset_tokens` table in Supabase PostgreSQL (no in-memory fallback).
 *    - Send password reset email.
 *    - Return generic success message.
 */
export async function requestForgotPassword(email: string, appUrl: string) {
  const genericSuccessMsg = "If an account exists for this email, a password reset link has been sent.";

  if (!email || typeof email !== 'string') {
    return { success: true, message: genericSuccessMsg };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!validateEmailFormat(normalizedEmail)) {
    return { success: true, message: genericSuccessMsg };
  }

  const supabase = getSupabaseClient();
  const user = await findUserByEmail(supabase, normalizedEmail);

  if (!user) {
    throw new Error("This email address is not registered in our database.");
  }

  // User EXISTS.
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes
  const tokenId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  // Clean up stale (used or expired) password reset records
  try {
    await supabase
      .from('password_reset_tokens')
      .delete()
      .or(`usedAt.not.is.null,expiresAt.lt.${nowIso}`);
  } catch (cleanupErr) {
    // Non-blocking cleanup
  }

  // 1. Invalidate existing active reset tokens in Supabase (Fail closed if invalidation fails)
  try {
    const { error: invalidateErr } = await supabase
      .from('password_reset_tokens')
      .update({ usedAt: nowIso })
      .eq('userId', user.id)
      .is('usedAt', null);

    if (invalidateErr) {
      console.error('[DIAGNOSTIC_LOG] [AUTH_SERVICE] ❌ Failed to invalidate previous reset tokens:', invalidateErr.message || invalidateErr);
      throw new Error('Unable to process password reset at this time.');
    }
  } catch (err: any) {
    console.error('[DIAGNOSTIC_LOG] [AUTH_SERVICE] ❌ Exception during token invalidation in Supabase:', err?.message || err);
    throw new Error('Unable to process password reset at this time.');
  }

  // 2. Store new reset token record in password_reset_tokens table (Required persistent storage - no in-memory fallback)
  try {
    const { error: insertErr } = await supabase
      .from('password_reset_tokens')
      .insert({
        id: tokenId,
        userId: user.id,
        tokenHash,
        expiresAt,
        usedAt: null,
        createdAt: nowIso
      });

    if (insertErr) {
      console.error('[DIAGNOSTIC_LOG] [AUTH_SERVICE] ❌ Failed to store password reset token in Supabase:', insertErr.message || insertErr);
      throw new Error('Unable to process password reset at this time.');
    }
  } catch (err: any) {
    console.error('[DIAGNOSTIC_LOG] [AUTH_SERVICE] ❌ Exception storing password reset token in Supabase:', err?.message || err);
    throw new Error('Unable to process password reset at this time.');
  }

  // 3. Send email through Brevo email service
  try {
    await sendPasswordResetEmail(user.email, rawToken, appUrl, user.name);
    return { success: true, message: "The verification link has been sent to your email." };
  } catch (emailErr: any) {
    console.error('[DIAGNOSTIC_LOG] [AUTH_SERVICE] ❌ Failed to dispatch password reset email:', emailErr?.message || emailErr);
    throw new Error('Unable to send the password reset email. Please try again later.');
  }
}

/**
 * Resets user password using a raw reset token (strict database persistence, no in-memory fallback):
 */
export async function resetPassword(token: string, newPassword: string) {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    throw new Error('Reset token is required.');
  }

  const passValidation = validatePasswordStrength(newPassword);
  if (!passValidation.valid) {
    throw new Error(passValidation.message || 'Invalid password.');
  }

  const supabase = getSupabaseClient();
  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
  const nowIso = new Date().toISOString();

  // Atomically claim the token: update usedAt = nowIso only if usedAt is null and expiresAt > now
  let tokenData: any = null;
  try {
    const { data: updatedTokens, error: claimErr } = await supabase
      .from('password_reset_tokens')
      .update({ usedAt: nowIso })
      .eq('tokenHash', tokenHash)
      .is('usedAt', null)
      .gt('expiresAt', nowIso)
      .select('*');

    if (claimErr) {
      console.warn('⚠️ Error claiming password reset token in Supabase:', claimErr.message || claimErr);
    } else if (updatedTokens && updatedTokens.length > 0) {
      tokenData = updatedTokens[0];
    }
  } catch (err: any) {
    console.warn('⚠️ Exception claiming password reset token in Supabase:', err?.message || err);
  }

  if (!tokenData) {
    throw new Error('Invalid, expired, or already used password reset token.');
  }

  // Fetch user from Aamarva users table
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', tokenData.userId)
    .maybeSingle();

  if (userErr || !user) {
    throw new Error('Database error finding user account.');
  }

  const newPasswordHash = await hashPassword(newPassword);

  // Update user password
  const { error: updateError } = await supabase
    .from('users')
    .update({ passwordHash: newPasswordHash, updatedAt: new Date().toISOString() })
    .eq('id', user.id);

  if (updateError) {
    throw new Error('Failed to update password.');
  }

  return { message: 'Password has been successfully reset.' };
}

