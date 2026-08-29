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
  type?: 'human' | 'agent';
}

export interface HumanSessionPayload {
  id: string;
  agentId: string;
  email: string;
  type: 'human';
}

export interface AgentTokenPayload {
  id: string;
  agentId: string;
  email: string;
  type: 'agent';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export const REFRESH_COOKIE_NAME = 'aamarva_rt';
export const HUMAN_SESSION_COOKIE_NAME = 'aamarva_human_session';

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

export function getHumanSessionCookieOptions() {
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
  if (!password || typeof password !== 'string' || password.length === 0) {
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

export async function getAuthUsersList(forceRefresh = false): Promise<any[]> {
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

export async function getAuthUserForRecord(supabase: any, userRecord: { id?: string; email?: string }): Promise<any> {
  if (!supabase || !supabase.auth?.admin || !userRecord?.id) return null;

  try {
    const { data: authUserData, error: idErr } = await supabase.auth.admin.getUserById(userRecord.id);
    if (!idErr && authUserData?.user) {
      return authUserData.user;
    }
    if (idErr) {
      console.error(`[AuthUserLookup] Failed to retrieve Auth user by ID ${userRecord.id}:`, idErr.message);
    }
  } catch (e: any) {
    console.error(`[AuthUserLookup] Exception during Auth user lookup for ID ${userRecord.id}:`, e?.message || e);
  }

  return null;
}

export function generateAgentId(): string {
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `AMR-${randomHex}`;
}

export function generateApiKey(): string {
  return `sk_amr_${crypto.randomBytes(24).toString('hex')}`;
}

export async function createHumanSession(userId: string): Promise<string> {
  const payload = {
    userId,
    type: 'human',
    iat: Math.floor(Date.now() / 1000)
  };
  const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
  return token;
}

export async function verifyHumanSession(rawSessionId: string): Promise<HumanSessionPayload | null> {
  if (!rawSessionId || typeof rawSessionId !== 'string' || rawSessionId.trim() === '') {
    return null;
  }

  try {
    const decoded = jwt.verify(rawSessionId.trim(), getJwtSecret()) as any;
    if (!decoded || !decoded.userId || decoded.type !== 'human') {
      return null;
    }

    const supabase = getSupabaseClient();
    const user = await findUserById(supabase, decoded.userId);
    if (!user || user.status !== 'active') {
      return null;
    }

    // Invalidation check: Only revoke if user password/credentials were explicitly rotated after this session was issued
    if (user.passwordChangedAt && decoded.iat) {
      const pwdChangedSeconds = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
      if (decoded.iat < pwdChangedSeconds) {
        return null;
      }
    }

    return {
      id: user.id,
      agentId: user.agentId,
      email: user.email,
      type: 'human',
    };
  } catch (err: any) {
    return null;
  }
}

export async function invalidateHumanSession(rawSessionId: string): Promise<void> {
  if (!rawSessionId || typeof rawSessionId !== 'string') return;
  try {
    const decoded = jwt.verify(rawSessionId.trim(), getJwtSecret()) as any;
    if (decoded && decoded.userId) {
      await invalidateAllHumanSessionsForUser(decoded.userId);
    }
  } catch (e: any) {}
}

export async function invalidateAllHumanSessionsForUser(userId: string): Promise<void> {
  if (!userId) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('users')
    .update({ passwordChangedAt: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    console.error(`[SessionInvalidation] Failed to invalidate human sessions for user ${userId}:`, error.message || error);
    throw new Error(`Failed to invalidate existing human sessions: ${error.message || 'Database error'}`);
  }
}

export function generateAgentAccessToken(user: UserRecord): string {
  const payload: AgentTokenPayload = {
    id: user.id,
    agentId: user.agentId,
    email: user.email,
    type: 'agent',
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '1d' });
}

export function verifyAgentAccessToken(token: string): AgentTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    if (!decoded || !decoded.id || !decoded.agentId) {
      return null;
    }
    // Human sessions are explicitly rejected as agent tokens
    if (decoded.type === 'human') {
      return null;
    }
    return {
      id: decoded.id,
      agentId: decoded.agentId,
      email: decoded.email,
      type: 'agent',
    };
  } catch (err) {
    return null;
  }
}

export function generateAccessToken(user: UserRecord): string {
  return generateAgentAccessToken(user);
}

export function generateRefreshToken(userId: string, familyId: string): string {
  return jwt.sign({ userId, familyId }, getJwtRefreshSecret(), { expiresIn: '7d' });
}

export async function persistRefreshToken(userId: string, familyId: string, refreshToken: string) {
  const supabase = getSupabaseClient();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('refresh_tokens').insert({
    id: crypto.randomUUID(),
    userId,
    tokenHash,
    familyId,
    isRevoked: false,
    expiresAt,
    createdAt: new Date().toISOString()
  });

  if (error) {
    console.error("persistRefreshToken DB Error:", error);
    throw new Error('Failed to persist refresh token.');
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token: string): UserTokenPayload | null {
  return verifyAgentAccessToken(token);
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
    agentId: raw.agentId || '',
    email: raw.email || '',
    passwordHash: raw.passwordHash || '',
    apiKeyHash: apiKeyHash, // Use dedicated hash field from metadata
    name: raw.name || '',
    status: raw.status || 'active',
    avatar: raw.avatar || '🤖',
    bio: (raw.bio || '').trim() || DEFAULT_BIO,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    passwordChangedAt: raw.passwordChangedAt,
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
    name: newUser.name,
    status: newUser.status,
    avatar: newUser.avatar,
    bio: newUser.bio || DEFAULT_BIO,
    createdAt: newUser.createdAt,
    updatedAt: newUser.updatedAt,
  };

  const { error } = await supabase.from('users').insert([camelRecord]);
  if (!error) return;

  if (error?.code === '23505') {
    throw new Error('An agent or user with this email already exists.');
  }

  throw new Error(`Database error: ${error.message}`);
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
  tokens: { accessToken: string; refreshToken: string };
  user: Omit<UserRecord, 'passwordHash'>;
  sessionId: string;
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
      // ignore
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
  if (data.password) {
    const passVal = validatePasswordStrength(data.password);
    if (!passVal.valid) {
      throw new Error(passVal.message || 'Password must be at least 12 characters long.');
    }
  }
  const passwordHash = data.password ? await hashPassword(data.password) : await hashPassword(crypto.randomBytes(32).toString('hex'));
  const apiKeyHash = await hashApiKey(apiKeyToUse);
  const apiKeyFingerprint = computeApiKeyFingerprint(apiKeyToUse);

  let authUserId = crypto.randomUUID();
  let authUserCreated = false;

  // 1. Create in Supabase Auth first if possible to satisfy foreign key constraints
  if (supabase) {
    // Pre-check: If user already exists in the database table, fail early with standard duplicate error
    const { data: existingDbUser } = await supabase.from('users').select('id').eq('email', normalizedEmail).maybeSingle();
    if (existingDbUser) {
      throw new Error('An agent or user with this email already exists.');
    }

    try {
      if (supabase.auth?.admin?.createUser) {
        let createdAuthUser: any = null;
        let authCreateErr: any = null;

        const attemptCreate = async () => {
          const res = await supabase.auth.admin.createUser({
            email: normalizedEmail,
            password: data.password || crypto.randomBytes(32).toString('hex'),
            email_confirm: true,
            user_metadata: {
              agentId,
              name: agentName,
              avatar: `https://robohash.org/${agentId.toLowerCase()}.png?set=set1`,
              bio: (data.bio || '').trim() || DEFAULT_BIO
            },
            app_metadata: { apiKeyHash, apiKeyFingerprint }
          });
          createdAuthUser = res.data;
          authCreateErr = res.error;
        };

        await attemptCreate();

        // If auth user already exists, but we verified they do NOT exist in the users table, it's an orphaned auth user.
        // We can safely list users, find their ID, delete them, and retry to make registration completely retry-safe.
        if (authCreateErr && (authCreateErr.message?.toLowerCase().includes('already exists') || authCreateErr.message?.toLowerCase().includes('already registered'))) {
          console.warn(`Auth user exists for ${normalizedEmail} but no database record exists. Cleaning up orphaned auth user to allow retry...`);
          const { data: listResult, error: listErr } = await supabase.auth.admin.listUsers({
            perPage: 1000
          });
          if (!listErr && listResult?.users) {
            const orphaned = listResult.users.find((u: any) => normalizeEmail(u.email || '') === normalizedEmail);
            if (orphaned) {
              await supabase.auth.admin.deleteUser(orphaned.id);
              console.log(`Successfully deleted orphaned auth user ${orphaned.id}`);
              // Retry creation
              await attemptCreate();
            }
          }
        }

        if (authCreateErr) {
          throw new Error(`Failed to create auth user: ${authCreateErr.message}`);
        }
        if (createdAuthUser?.user?.id) {
          authUserId = createdAuthUser.user.id;
          authUserCreated = true;
        }
      } else if (supabase.auth?.signUp) {
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: data.password || crypto.randomBytes(32).toString('hex'),
          options: {
            data: {
              agentId,
              name: agentName,
              avatar: `https://robohash.org/${agentId.toLowerCase()}.png?set=set1`,
              bio: (data.bio || '').trim() || DEFAULT_BIO
            }
          }
        });
        if (signUpErr) {
          throw new Error(`Failed to sign up auth user: ${signUpErr.message}`);
        }
        if (signUpData?.user?.id) {
          authUserId = signUpData.user.id;
          authUserCreated = true;
          if (supabase.auth?.admin?.updateUserById) {
            await supabase.auth.admin.updateUserById(authUserId, {
              app_metadata: { apiKeyHash, apiKeyFingerprint }
            });
          }
        }
      }
    } catch (authErr: any) {
      console.error('Auth user creation failed:', authErr);
      throw new Error(`Authentication provider error: ${authErr.message}`);
    }
  }

  const newUser: UserRecord = {
    id: authUserId,
    agentId,
    email: normalizedEmail,
    passwordHash,
    apiKeyHash: apiKeyHash,
    apiKeyFingerprint: apiKeyFingerprint,
    name: agentName,
    status: 'active',
    avatar: `https://robohash.org/${agentId.toLowerCase()}.png?set=set1`,
    bio: (data.bio || '').trim() || DEFAULT_BIO,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await insertUserToSupabase(supabase, newUser);
  } catch (insertErr: any) {
    console.error('Direct table insert failed:', insertErr);
    // If we successfully created an auth user but failed to insert into the users table,
    // we must clean up the orphaned auth user.
    if (authUserCreated && supabase && supabase.auth?.admin?.deleteUser) {
      try {
        await supabase.auth.admin.deleteUser(authUserId);
        console.log(`Cleaned up orphaned auth user ${authUserId}`);
      } catch (cleanupErr) {
        console.error(`Failed to clean up orphaned auth user ${authUserId}:`, cleanupErr);
      }
    }
    throw insertErr; // Rethrow to fail the registration and return an error response
  }

  if (supabase) {
    invalidateAuthCache();
  }
  
  try {
    const sessionId = await createHumanSession(newUser.id);
    const familyId = crypto.randomUUID();
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser.id, familyId);
    await persistRefreshToken(newUser.id, familyId, refreshToken);
    const { passwordHash: _, apiKeyHash: __, ...safeUser } = newUser;
    return {
      agentId,
      apiKey: apiKeyToUse,
      tokens: { accessToken, refreshToken },
      user: safeUser as any,
      sessionId
    };
  } catch (postInsertErr: any) {
    console.error('[Registration Recovery] Post-insert session/token creation failed. Initiating cleanup...', postInsertErr);
    
    // 1. Delete user from DB users table
    try {
      await supabase.from('users').delete().eq('id', newUser.id);
      console.log(`[Registration Recovery] Cleaned up database user record for ID ${newUser.id}`);
    } catch (dbCleanupErr) {
      console.error(`[Registration Recovery] Failed to clean up database user record:`, dbCleanupErr);
    }

    // 2. Delete user from Supabase Auth
    if (authUserCreated && supabase && supabase.auth?.admin?.deleteUser) {
      try {
        await supabase.auth.admin.deleteUser(authUserId);
        console.log(`[Registration Recovery] Cleaned up Supabase Auth user ID ${authUserId}`);
      } catch (authCleanupErr) {
        console.error(`[Registration Recovery] Failed to clean up Supabase Auth user:`, authCleanupErr);
      }
    }

    throw postInsertErr;
  }
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

// Legacy findUserByApiKey lookup completely removed

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

  const sessionId = await createHumanSession(normalizedUser.id);
  const { passwordHash: _, apiKeyHash: __, ...safeUser } = normalizedUser;

  return { user: safeUser, sessionId };
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

  if (userRecord.status !== 'active') {
    throw new Error('This account is currently inactive.');
  }

  // Fetch Supabase Auth user to get apiKeyHash from authoritative app_metadata
  const authUser = await getAuthUserForRecord(supabase, userRecord);
  if (!authUser || !authUser.app_metadata?.apiKeyHash) {
    throw new Error('Agent Login failed: Invalid API Key.');
  }

  const isApiKeyValid = await compareApiKey(apiKey, authUser.app_metadata.apiKeyHash);
  if (!isApiKeyValid) {
    throw new Error('Agent Login failed: Invalid API Key.');
  }

  // Backfill fingerprint into app_metadata and users table if missing
  const fingerprint = computeApiKeyFingerprint(apiKey);
  if (!authUser.app_metadata?.apiKeyFingerprint) {
    try {
      await supabase.auth.admin.updateUserById(authUser.id, {
        app_metadata: { ...authUser.app_metadata, apiKeyFingerprint: fingerprint }
      });
      invalidateAuthCache();
    } catch (err) {
      console.warn('Failed to update apiKeyFingerprint on agent login:', err);
    }
  }

  if (!userRecord.apiKeyFingerprint) {
    try {
      await supabase.from('users').update({ apiKeyFingerprint: fingerprint }).eq('id', userRecord.id);
    } catch (err) {
      console.warn('Failed to backfill apiKeyFingerprint to users table on login:', err);
    }
  }

  const familyId = crypto.randomUUID();
  const normalizedUser = normalizeUserRecord(userRecord, authUser);
  const accessToken = generateAccessToken(normalizedUser);
  const refreshToken = generateRefreshToken(normalizedUser.id, familyId);
  await persistRefreshToken(normalizedUser.id, familyId, refreshToken);

  const { passwordHash: _, apiKeyHash: __, ...safeUser } = normalizedUser;

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
  
  const { passwordHash: _, apiKeyHash: __, ...safeUser } = normalizeUserRecord(updatedUser);
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

  // --- EXECUTE DELETIONS IN BOTTOM-UP DEPENDENCY ORDER ---

  // Step 1: Delete Messages sent by the user
  await supabase.from('messages').delete().eq('senderUserId', userId);

  // Step 2: Delete Connection Requests involving the user
  await supabase.from('connection_requests').delete().eq('senderUserId', userId);
  await supabase.from('connection_requests').delete().eq('receiverUserId', userId);

  // Step 3: Delete Connections involving the user
  await supabase.from('connections').delete().eq('postOwnerUserId', userId);
  await supabase.from('connections').delete().eq('replyAuthorUserId', userId);

  // Step 4: Delete Replies written by the user
  await supabase.from('replies').delete().eq('userId', userId);

  // Step 5: Delete Posts authored by the user
  await supabase.from('posts').delete().eq('userId', userId);

  // Step 6: Delete Password Reset Tokens, Refresh Tokens, and Human Sessions
  await invalidateAllHumanSessionsForUser(userId);
  await supabase.from('human_sessions').delete().eq('userId', userId);
  await supabase.from('password_reset_tokens').delete().eq('userId', userId);
  await supabase.from('refresh_tokens').delete().eq('userId', userId);

  // Step 7: Delete User Record
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

  // Step G: Try deleting from Supabase Auth admin directly using the known userId
  try {
    if (supabase.auth?.admin?.deleteUser) {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteError) {
        // If user doesn't exist in Supabase Auth, log a warning but don't fail if the DB record was already cleanly deleted
        if (deleteError.message?.toLowerCase().includes('not found')) {
          console.warn(`[Account Deletion Warning] Corresponding Auth user for ID ${userId} was not found in Supabase Auth.`);
        } else {
          console.error('[Account Deletion Error] Failed to delete Supabase Auth user directly:', deleteError);
          throw new Error(`Failed to delete corresponding Auth user account: ${deleteError.message}`);
        }
      } else {
        console.log(`[Account Deletion] Successfully deleted Supabase Auth user ID: ${userId}`);
      }
    } else {
      throw new Error('Supabase Auth admin client is not initialized or does not have deleteUser permissions.');
    }
  } catch (e: any) {
    console.error('[Account Deletion Error] Supabase Auth admin delete exception:', e?.message || e);
    throw e;
  }
}

export async function logoutHumanSession(rawSessionId?: string) {
  if (rawSessionId) {
    await invalidateHumanSession(rawSessionId);
  }
}

export async function logoutAgent(userId: string, refreshToken?: string) {
  if (refreshToken) {
    try {
      const tokenHash = hashToken(refreshToken);
      const supabase = getSupabaseClient();
      await supabase.from('refresh_tokens').delete().eq('tokenHash', tokenHash).eq('userId', userId);
    } catch (e) {
      console.error(`[Logout] Error deleting token: ${e}`);
    }
  }
}

export async function logoutUser(userId: string, refreshToken?: string) {
  return logoutAgent(userId, refreshToken);
}

export async function refreshSessionToken(token: string): Promise<{ user: Omit<UserRecord, 'passwordHash'>; tokens: AuthTokens }> {
  const decoded = verifyRefreshToken(token);
  if (!decoded) {
    throw new Error('Invalid or expired refresh token signature.');
  }

  const { userId, familyId } = decoded;
  const supabase = getSupabaseClient();
  const user = await findUserById(supabase, userId);

  if (!user || user.status !== 'active') {
    throw new Error('User is inactive or not found.');
  }

  const tokenHash = hashToken(token);
  const { data: storedToken, error: tokenError } = await supabase
    .from('refresh_tokens')
    .select('*')
    .eq('tokenHash', tokenHash)
    .maybeSingle();
    
  if (tokenError || !storedToken) {
    throw new Error('Invalid refresh token.');
  }
  
  if (storedToken.isRevoked) {
    // Refresh token reuse detected! Revoke the whole family.
    await supabase.from('refresh_tokens').update({ isRevoked: true }).eq('familyId', familyId);
    throw new Error('Refresh token has been revoked.');
  }
  
  if (storedToken.userId !== userId) {
    throw new Error('Invalid refresh token ownership.');
  }
  
  if (new Date(storedToken.expiresAt).getTime() < Date.now()) {
    throw new Error('Refresh token has expired.');
  }

  // Atomic revoke the old token
  const { data: revokedTokens, error: revokeError } = await supabase
    .from('refresh_tokens')
    .update({ isRevoked: true })
    .eq('id', storedToken.id)
    .eq('isRevoked', false)
    .select();

  if (revokeError || !revokedTokens || revokedTokens.length === 0) {
    // Concurrent reuse detected! Revoke the whole family.
    await supabase.from('refresh_tokens').update({ isRevoked: true }).eq('familyId', familyId);
    throw new Error('Refresh token has already been rotated or revoked concurrently.');
  }

  const authUser = await getAuthUserForRecord(supabase, user);
  const normalizedUser = normalizeUserRecord(user, authUser);
  const newAccessToken = generateAccessToken(normalizedUser);
  const nextFamilyId = familyId || crypto.randomUUID();
  const newRefreshToken = generateRefreshToken(userId, nextFamilyId);
  await persistRefreshToken(userId, nextFamilyId, newRefreshToken);

  const { passwordHash: _, apiKeyHash: __, ...safeUser } = normalizedUser;
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

  // 4. Find the Supabase Auth User directly (O(1)) using getAuthUserForRecord
  const authUser = await getAuthUserForRecord(supabase, user);
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

  // 6. Update the public users table apiKeyFingerprint and updatedAt for timestamp sync
  try {
    await supabase
      .from('users')
      .update({
        apiKeyFingerprint,
        updatedAt: new Date().toISOString()
      })
      .eq('id', user.id);
  } catch (err: any) {
    console.warn('Non-fatal: Failed to update users.apiKeyFingerprint during rotation:', err.message);
  }

  invalidateAuthCache();

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

  // 4. Generate verification token bound to user id
  const secret = crypto.randomBytes(32).toString('hex');
  const token = `${user.id}.${secret}`;
  const tokenHash = crypto.createHash('sha256').update(secret).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

  // 5. Store in Supabase Auth app_metadata directly using user.id
  const { data: authUserData, error: authUserErr } = await supabase.auth.admin.getUserById(user.id);
  const authUser = authUserData?.user;
  if (authUserErr || !authUser) throw new Error('Auth account not found.');

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
  let targetAuthUser: any = null;
  let pendingData: any = null;

  // 1. Direct O(1) Auth user lookup via userId encoded in the verification token
  if (token && token.includes('.')) {
    const parts = token.split('.');
    const userId = parts[0];
    const secret = parts.slice(1).join('.');
    const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

    const { data: authUserData, error: authUserErr } = await supabase.auth.admin.getUserById(userId);
    if (!authUserErr && authUserData?.user) {
      const p = authUserData.user.app_metadata?.pendingEmailChange;
      if (p && (p.tokenHash === secretHash || p.tokenHash === crypto.createHash('sha256').update(token).digest('hex'))) {
        targetAuthUser = authUserData.user;
        pendingData = p;
      }
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
    return { success: true, message: genericSuccessMsg };
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

  // 1. Invalidate existing active reset tokens in Supabase
  try {
    await supabase
      .from('password_reset_tokens')
      .update({ usedAt: nowIso })
      .eq('userId', user.id)
      .is('usedAt', null);
  } catch (err: any) {
    console.error('[DIAGNOSTIC_LOG] [AUTH_SERVICE] ❌ Failed to invalidate previous reset tokens:', err?.message || err);
  }

  // 2. Store new reset token record in password_reset_tokens table
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
      return { success: true, message: genericSuccessMsg };
    }
  } catch (err: any) {
    console.error('[DIAGNOSTIC_LOG] [AUTH_SERVICE] ❌ Exception storing password reset token in Supabase:', err?.message || err);
    return { success: true, message: genericSuccessMsg };
  }

  // 3. Send email through Brevo email service using server-side configuration
  const targetAppUrl = appUrl || process.env.APP_URL || config.appUrl || 'https://ais-dev-sy4lhzb3bv4g4mm7spkr5c-89865814157.asia-southeast1.run.app';
  try {
    await sendPasswordResetEmail(user.email, rawToken, targetAppUrl, user.name);
  } catch (emailErr: any) {
    console.error('[DIAGNOSTIC_LOG] [AUTH_SERVICE] ❌ Failed to dispatch password reset email:', emailErr?.message || emailErr);
  }

  return { success: true, message: genericSuccessMsg };
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

  // Update user password and updatedAt
  const { error: updateError } = await supabase
    .from('users')
    .update({ passwordHash: newPasswordHash, updatedAt: new Date().toISOString() })
    .eq('id', user.id);

  if (updateError) {
    throw new Error('Failed to update password.');
  }

  // After the password update succeeds, invalidate all existing human sessions
  await invalidateAllHumanSessionsForUser(user.id);

  // Also update password in Supabase Auth if auth user exists
  try {
    const authUser = await getAuthUserForRecord(supabase, user);
    if (authUser?.id && supabase.auth?.admin?.updateUserById) {
      await supabase.auth.admin.updateUserById(authUser.id, { password: newPassword });
    }
  } catch (authErr) {
    console.warn('Non-fatal: failed to update password in Supabase auth admin:', authErr);
  }

  return { message: 'Password has been successfully reset.' };
}

