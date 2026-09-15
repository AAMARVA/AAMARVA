import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { UserRecord, RefreshTokenRecord, WebAuthnCredentialRecord } from './db.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';
import { sendEmailVerification, sendPasswordResetEmail, sendAccountVerificationEmail } from './emailService.js';
import { config } from './config.js';
import { validateAndNormalizeWhitelist, isIpAllowed } from './utils/networkWhitelist.js';


export interface UserTokenPayload {
  id: string;
  agentId: string;
  email: string;
  emailVerified?: boolean;
  type?: 'human' | 'agent' | 'command_pit';
  isCommandPit?: boolean;
  commandPitScopes?: string[];
}

export interface HumanSessionPayload {
  id: string;
  agentId: string;
  email: string;
  emailVerified?: boolean;
  type: 'human';
}

export interface AgentTokenPayload {
  id: string;
  agentId: string;
  email: string;
  emailVerified?: boolean;
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
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Security Configuration Error] JWT_SECRET environment variable is not defined.');
    }
    return 'aamarva-dev-jwt-secret-placeholder-minimum-length-32';
  }
  if (secret.length < 32 && process.env.NODE_ENV === 'production') {
    throw new Error('[Security Configuration Error] JWT_SECRET must be at least 32 characters long in production.');
  }
  return secret;
}

function getJwtRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Security Configuration Error] JWT_REFRESH_SECRET environment variable is not defined.');
    }
    return 'aamarva-dev-refresh-secret-placeholder-minimum-length-32';
  }
  if (secret.length < 32 && process.env.NODE_ENV === 'production') {
    throw new Error('[Security Configuration Error] JWT_REFRESH_SECRET must be at least 32 characters long in production.');
  }
  if (process.env.NODE_ENV === 'production' && secret === process.env.JWT_SECRET?.trim()) {
    throw new Error('[Security Configuration Error] JWT_REFRESH_SECRET must be distinct from JWT_SECRET in production.');
  }
  return secret;
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
  const sessionId = crypto.randomUUID();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expSeconds = nowSeconds + 7 * 24 * 3600; // 7 days
  
  const payload = {
    userId,
    type: 'human',
    iat: nowSeconds,
    exp: expSeconds,
    sessionId
  };
  const token = jwt.sign(payload, getJwtSecret());
  
  const sessionHash = crypto.createHash('sha256').update(sessionId).digest('hex');
  const recordId = crypto.randomUUID();
  
  const supabase = getSupabaseClient();
  let insertError: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.from('human_sessions').insert({
      id: recordId,
      userId,
      sessionHash,
      expiresAt: new Date(expSeconds * 1000).toISOString(),
      createdAt: new Date().toISOString()
    });
    if (!error) {
      insertError = null;
      break;
    }
    insertError = error;
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }
  
  if (insertError) {
    console.error('[createHumanSession] Failed to persist session to database:', insertError);
    throw new Error(`Failed to create session: ${insertError.message || insertError}`);
  }
  
  return token;
}

export async function verifyHumanSession(rawSessionId: string): Promise<HumanSessionPayload | null> {
  if (!rawSessionId || typeof rawSessionId !== 'string' || rawSessionId.trim() === '') {
    return null;
  }

  try {
    const decoded = jwt.verify(rawSessionId.trim(), getJwtSecret()) as any;
    if (!decoded || !decoded.userId || decoded.type !== 'human' || !decoded.sessionId) {
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

    // Database lookup check to verify the actual human session is still active
    const sessionHash = crypto.createHash('sha256').update(decoded.sessionId).digest('hex');
    const { data: sessionRecord, error: sessionErr } = await supabase
      .from('human_sessions')
      .select('*')
      .eq('sessionHash', sessionHash)
      .maybeSingle();

    if (sessionErr || !sessionRecord) {
      return null; // session does not exist in database (revoked/deleted)
    }

    // Verify it belongs to the authenticated user
    if (sessionRecord.userId !== decoded.userId) {
      return null;
    }

    // Verify it has not expired
    if (new Date(sessionRecord.expiresAt).getTime() < Date.now()) {
      return null;
    }

    return {
      id: user.id,
      agentId: user.agentId,
      email: user.email,
      emailVerified: Boolean(user.emailVerified === true),
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
    if (decoded && decoded.sessionId) {
      const sessionHash = crypto.createHash('sha256').update(decoded.sessionId).digest('hex');
      const supabase = getSupabaseClient();
      await supabase
        .from('human_sessions')
        .delete()
        .eq('sessionHash', sessionHash);
    }
  } catch (e: any) {}
}

export async function invalidateAllHumanSessionsForUser(userId: string): Promise<void> {
  if (!userId) return;
  const supabase = getSupabaseClient();
  
  // 1. Update passwordChangedAt to invalidate older JWTs
  const { error: updateErr } = await supabase
    .from('users')
    .update({ passwordChangedAt: new Date().toISOString() })
    .eq('id', userId);

  if (updateErr) {
    console.error(`[SessionInvalidation] Failed to update passwordChangedAt for user ${userId}:`, updateErr.message);
  }

  // 2. Delete all sessions for the user in the database
  const { error: deleteErr } = await supabase
    .from('human_sessions')
    .delete()
    .eq('userId', userId);

  if (deleteErr) {
    console.error(`[SessionInvalidation] Failed to delete human sessions for user ${userId}:`, deleteErr.message || deleteErr);
    throw new Error(`Failed to invalidate existing human sessions: ${deleteErr.message || 'Database error'}`);
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
  
  let insertError: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.from('refresh_tokens').insert({
      id: crypto.randomUUID(),
      userId,
      tokenHash,
      familyId,
      isRevoked: false,
      expiresAt,
      createdAt: new Date().toISOString()
    });
    if (!error) {
      insertError = null;
      break;
    }
    insertError = error;
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }

  if (insertError) {
    console.error("persistRefreshToken DB Error:", insertError);
    throw new Error(`Failed to persist refresh token: ${insertError.message || insertError}`);
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

// The database (public.users.emailVerified) is the sole source of truth for verification.
export function isAccountVerified(userOrFlag?: any, _legacyAgentId?: string): boolean {
  if (!userOrFlag) return false;
  if (typeof userOrFlag === 'boolean') return userOrFlag;
  if (typeof userOrFlag === 'object' && userOrFlag !== null) {
    return Boolean(userOrFlag.emailVerified === true || userOrFlag.email_verified === true);
  }
  return false;
}

export function getVerificationStatus(userOrFlag?: any, _agentId?: string, emailVerified?: boolean): string {
  if (typeof emailVerified === 'boolean') {
    return emailVerified ? 'verified' : 'not verified';
  }
  return isAccountVerified(userOrFlag) ? 'verified' : 'not verified';
}

export async function initVerifiedUsersCache() {
  // Deprecated: public.users is the sole source of truth.
}

export function normalizeUserRecord(raw: any, authUser?: any): UserRecord {
  if (!raw) return raw;
  
  // Authoritative apiKeyHash source: auth.user.app_metadata (Admin-only)
  const apiKeyHash = authUser?.app_metadata?.apiKeyHash || '';

  // Sole source of truth: public.users table (emailVerified column)
  const isVerified = Boolean(
    raw.emailVerified === true ||
    raw.email_verified === true
  );

  const whitelisted_networks = Array.isArray(raw.whitelisted_networks) && raw.whitelisted_networks.length > 0
    ? raw.whitelisted_networks
    : Array.isArray(raw.whitelistedNetworks) && raw.whitelistedNetworks.length > 0
    ? raw.whitelistedNetworks
    : Array.isArray(authUser?.app_metadata?.whitelisted_networks)
    ? authUser.app_metadata.whitelisted_networks
    : Array.isArray(authUser?.app_metadata?.whitelistedNetworks)
    ? authUser.app_metadata.whitelistedNetworks
    : Array.isArray(raw.whitelisted_networks)
    ? raw.whitelisted_networks
    : Array.isArray(raw.whitelistedNetworks)
    ? raw.whitelistedNetworks
    : [];

  return {
    id: raw.id,
    agentId: raw.agentId || '',
    verificationStatus: isVerified ? 'verified' : 'not verified',
    verification_status: isVerified ? 'verified' : 'not verified',
    ["verification status"]: isVerified ? 'verified' : 'not verified',
    email: raw.email || '',
    emailVerified: isVerified,
    emailVerifiedAt: raw.emailVerifiedAt || raw.email_verified_at || undefined,
    passwordHash: raw.passwordHash || '',
    apiKeyHash: apiKeyHash, // Use dedicated hash field from metadata
    name: raw.name || '',
    status: raw.status || 'active',
    avatar: raw.avatar || '🤖',
    bio: (raw.bio || '').trim() || DEFAULT_BIO,
    whitelisted_networks,
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

export async function findUserById(supabase: any, id: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  let authUser: any = null;
  if (!data.whitelisted_networks && !data.whitelistedNetworks) {
    try {
      authUser = await getAuthUserForRecord(supabase, data);
    } catch (e) {
      // ignore
    }
  }

  return normalizeUserRecord(data, authUser);
}

export async function insertUserToSupabase(supabase: any, newUser: UserRecord) {
  const camelRecord: Record<string, any> = {
    id: newUser.id,
    agentId: newUser.agentId,
    email: newUser.email,
    passwordHash: newUser.passwordHash,
    apiKeyFingerprint: (newUser as any).apiKeyFingerprint,
    name: newUser.name,
    status: newUser.status,
    avatar: newUser.avatar,
    bio: newUser.bio || DEFAULT_BIO,
    emailVerified: false,
    whitelisted_networks: (newUser as any).whitelisted_networks || [],
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
  appUrl?: string;
  whitelisted_networks?: any;
}, clientIp?: string): Promise<{
  agentId: string;
  apiKey: string;
  tokens: { accessToken: string; refreshToken: string };
  user: Omit<UserRecord, 'passwordHash'> & { password?: string };
}> {
  const normalizedEmail = normalizeEmail(data.email || '');
  if (!normalizedEmail || !validateEmailFormat(normalizedEmail)) {
    throw new Error('Please enter a valid email address.');
  }

  const whitelisted_networks = validateAndNormalizeWhitelist(data.whitelisted_networks, clientIp);

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
            email_confirm: false,
            user_metadata: {
              agentId,
              name: agentName,
              avatar: `https://robohash.org/${agentId.toLowerCase()}.png?set=set1`,
              bio: (data.bio || '').trim() || DEFAULT_BIO
            },
            app_metadata: { apiKeyHash, apiKeyFingerprint, emailVerified: false, whitelisted_networks }
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
              app_metadata: { apiKeyHash, apiKeyFingerprint, whitelisted_networks }
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
    emailVerified: false,
    whitelisted_networks,
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

    // Set initial emailVerified status to false in app_metadata
    try {
      if (supabase.auth?.admin?.updateUserById) {
        await supabase.auth.admin.updateUserById(newUser.id, {
          app_metadata: {
            apiKeyHash,
            apiKeyFingerprint,
            emailVerified: false,
          },
        });
      }
    } catch (verifErr: any) {
      console.warn('[Registration] Notice setting initial emailVerified state:', verifErr?.message || verifErr);
    }
  }
  
  try {
    // Note: Invariant enforcement: NO human session exists until successful WebAuthn passkey enrollment.
    // Human sessions are NOT created here; only agent tokens and user credentials are generated.
    const familyId = crypto.randomUUID();
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser.id, familyId);
    await persistRefreshToken(newUser.id, familyId, refreshToken);
    const { passwordHash: _, apiKeyHash: __, ...safeUser } = newUser;
    const returnUser = { ...safeUser };
    return {
      agentId,
      apiKey: apiKeyToUse,
      tokens: { accessToken, refreshToken },
      user: returnUser as any,
    };
  } catch (postInsertErr: any) {
    console.error('[Registration Recovery] Post-insert token creation failed. Initiating cleanup...', postInsertErr);
    
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

// --- WebAuthn & CSRF Human Authentication Boundary ---

const csrfTokenFallback = new Map<string, Date>();
const webAuthnChallengeFallback = new Map<string, WebAuthnChallengeRecord>();

export async function generateCsrfToken(): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  if (process.env.FORCE_CSRF_DB_FAIL === 'true') {
    console.error('[CSRF Bootstrap] Simulated database persistence failure.');
    throw new Error('Failed to persist CSRF token to database: Simulated DB Failure');
  }

  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[CSRF Security Error] Database persistence required for CSRF tokens in production.');
    }
    csrfTokenFallback.set(token, expiresAt);
    return token;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.from('csrf_tokens').insert({
    token,
    expiresAt: expiresAt.toISOString(),
  });

  if (error) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[CSRF Bootstrap] Failed to persist CSRF token to production database:', error.message || error.code || 'DB Error');
      throw new Error(`Failed to persist CSRF token to database: ${error.message || error.code || 'Database error'}`);
    }
    // In local development / non-production environments where migrations haven't run:
    if (error.code === 'PGRST205' || error.message?.includes('not find the table') || error.message?.includes('relation "public.csrf_tokens" does not exist')) {
      csrfTokenFallback.set(token, expiresAt);
      return token;
    }
    console.error('[CSRF Bootstrap] Failed to persist CSRF token to database:', error.message || error.code || 'DB Error');
    throw new Error(`Failed to persist CSRF token to database: ${error.message || error.code || 'Database error'}`);
  }

  // Periodic cleanup of expired tokens (low frequency)
  if (Math.random() < 0.05) {
    supabase.from('csrf_tokens').delete().lt('expiresAt', new Date().toISOString()).then();
  }

  return token;
}

export async function isValidCsrfToken(token?: string | null): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (!trimmed) return false;

  if (process.env.FORCE_CSRF_DB_FAIL === 'true') {
    return false;
  }

  if (process.env.NODE_ENV === 'production') {
    // Production path: STRICT database verification only, zero in-memory fallback
    if (!isSupabaseConfigured()) return false;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('csrf_tokens')
      .select('expiresAt')
      .eq('token', trimmed)
      .maybeSingle();

    if (error || !data) return false;
    if (new Date() > new Date(data.expiresAt)) {
      supabase.from('csrf_tokens').delete().eq('token', trimmed).then();
      return false;
    }
    return true;
  }

  // Non-production / test path:
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('csrf_tokens')
      .select('expiresAt')
      .eq('token', trimmed)
      .maybeSingle();

    if (!error && data) {
      if (new Date() > new Date(data.expiresAt)) {
        supabase.from('csrf_tokens').delete().eq('token', trimmed).then();
        return false;
      }
      return true;
    }

    if (error && (error.code === 'PGRST205' || error.message?.includes('not find the table'))) {
      if (csrfTokenFallback.has(trimmed)) {
        const exp = csrfTokenFallback.get(trimmed)!;
        if (new Date() > exp) {
          csrfTokenFallback.delete(trimmed);
          return false;
        }
        return true;
      }
    }
    return false;
  }

  if (csrfTokenFallback.has(trimmed)) {
    const exp = csrfTokenFallback.get(trimmed)!;
    if (new Date() > exp) {
      csrfTokenFallback.delete(trimmed);
      return false;
    }
    return true;
  }

  return false;
}

export interface WebAuthnChallengeRecord {
  challengeId: string;
  challenge: string;
  userId: string;
  agentId: string;
  type: 'login' | 'register';
  expiresAt: number;
  used: boolean;
}

export async function createWebAuthnChallenge(
  userId: string,
  agentId: string,
  challenge: string,
  type: 'login' | 'register'
): Promise<string> {
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes TTL
  
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('webauthn_challenges').insert({
    challengeId,
    challenge,
    userId,
    agentId,
    type,
    expiresAt: expiresAt.toISOString(),
    used: false
  });

  if (error && (error.code === 'PGRST205' || error.message?.includes('not find the table'))) {
    webAuthnChallengeFallback.set(challengeId, {
      challengeId,
      challenge,
      userId,
      agentId,
      type,
      expiresAt: expiresAt.getTime(),
      used: false
    });
  }

  if (Math.random() < 0.05) {
    supabase.from('webauthn_challenges').delete().lt('expiresAt', new Date().toISOString()).then();
    const now = Date.now();
    for (const [id, rec] of webAuthnChallengeFallback.entries()) {
      if (now > rec.expiresAt) webAuthnChallengeFallback.delete(id);
    }
  }

  return challengeId;
}

export async function consumeWebAuthnChallenge(
  challengeId: string,
  expectedUserId: string,
  type: 'login' | 'register'
): Promise<{ valid: boolean; challenge?: string; reason?: string }> {
  if (!challengeId) {
    return { valid: false, reason: 'Missing challenge ID.' };
  }
  
  if (webAuthnChallengeFallback.has(challengeId)) {
    const record = webAuthnChallengeFallback.get(challengeId)!;
    if (record.used) return { valid: false, reason: 'Challenge has already been used (replay detected).' };
    if (Date.now() > record.expiresAt) {
      webAuthnChallengeFallback.delete(challengeId);
      return { valid: false, reason: 'Challenge has expired.' };
    }
    if (record.type !== type) return { valid: false, reason: 'Challenge type mismatch.' };
    if (record.userId !== expectedUserId) return { valid: false, reason: 'Challenge bound to a different user session.' };
    record.used = true;
    return { valid: true, challenge: record.challenge };
  }
  
  const supabase = getSupabaseClient();
  const { data: record, error } = await supabase
    .from('webauthn_challenges')
    .select('*')
    .eq('challengeId', challengeId)
    .maybeSingle();
    
  if (error && (error.code === 'PGRST205' || error.message?.includes('not find the table'))) {
    return { valid: false, reason: 'Challenge not found or already purged.' };
  }
  if (error || !record) {
    return { valid: false, reason: 'Challenge not found or already purged.' };
  }
  if (record.used) {
    return { valid: false, reason: 'Challenge has already been used (replay detected).' };
  }
  if (new Date() > new Date(record.expiresAt)) {
    await supabase.from('webauthn_challenges').delete().eq('challengeId', challengeId);
    return { valid: false, reason: 'Challenge has expired.' };
  }
  if (record.type !== type) {
    return { valid: false, reason: 'Challenge type mismatch.' };
  }
  if (record.userId !== expectedUserId) {
    return { valid: false, reason: 'Challenge does not belong to the target account.' };
  }

  // Mark used immediately to prevent replay
  await supabase
    .from('webauthn_challenges')
    .update({ used: true })
    .eq('challengeId', challengeId);
    
  return { valid: true, challenge: record.challenge };
}

const memoryWebAuthnStore = new Map<string, WebAuthnCredentialRecord[]>();

export async function getUserWebAuthnCredentials(userId: string): Promise<WebAuthnCredentialRecord[]> {
  if (!userId) return [];
  const cached = memoryWebAuthnStore.get(userId);
  if (cached && cached.length > 0) {
    return [...cached];
  }

  const supabase = getSupabaseClient();
  try {
    if (supabase.auth?.admin?.getUserById) {
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (!error && data?.user?.app_metadata?.webauthnCredentials) {
        const creds = data.user.app_metadata.webauthnCredentials as WebAuthnCredentialRecord[];
        memoryWebAuthnStore.set(userId, creds);
        return [...creds];
      }
    }
  } catch (e) {}

  return memoryWebAuthnStore.get(userId) || [];
}

export async function saveUserWebAuthnCredential(userId: string, cred: WebAuthnCredentialRecord): Promise<void> {
  const existing = await getUserWebAuthnCredentials(userId);
  const targetId = cred.credentialId || cred.id;
  const normalizedCred: WebAuthnCredentialRecord = {
    ...cred,
    id: targetId,
    credentialId: targetId,
  };
  const updated = existing.filter(c => (c.credentialId || c.id) !== targetId);
  updated.push(normalizedCred);
  memoryWebAuthnStore.set(userId, updated);

  const supabase = getSupabaseClient();
  try {
    if (supabase.auth?.admin?.getUserById && supabase.auth?.admin?.updateUserById) {
      const { data } = await supabase.auth.admin.getUserById(userId);
      const existingAppMetadata = data?.user?.app_metadata || {};
      await supabase.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...existingAppMetadata,
          webauthnCredentials: updated,
        },
      });
    }
  } catch (e) {
    console.warn('[WebAuthn] Note persisting credential to Supabase Auth metadata:', (e as any)?.message || e);
  }
}

export async function updateUserWebAuthnCredentialCounter(userId: string, credentialId: string, newCounter: number): Promise<void> {
  const existing = await getUserWebAuthnCredentials(userId);
  const target = existing.find(c => (c.credentialId || c.id) === credentialId);
  if (target) {
    target.counter = newCounter;
    memoryWebAuthnStore.set(userId, existing);
    const supabase = getSupabaseClient();
    try {
      if (supabase.auth?.admin?.getUserById && supabase.auth?.admin?.updateUserById) {
        const { data } = await supabase.auth.admin.getUserById(userId);
        const existingAppMetadata = data?.user?.app_metadata || {};
        await supabase.auth.admin.updateUserById(userId, {
          app_metadata: {
            ...existingAppMetadata,
            webauthnCredentials: existing,
          },
        });
      }
    } catch (e) {}
  }
}

export async function deleteUserWebAuthnCredential(userId: string, credentialId: string): Promise<boolean> {
  const existing = await getUserWebAuthnCredentials(userId);
  const filtered = existing.filter(c => (c.credentialId || c.id) !== credentialId);
  if (filtered.length === existing.length) return false;
  memoryWebAuthnStore.set(userId, filtered);

  const supabase = getSupabaseClient();
  try {
    if (supabase.auth?.admin?.getUserById && supabase.auth?.admin?.updateUserById) {
      const { data } = await supabase.auth.admin.getUserById(userId);
      const existingAppMetadata = data?.user?.app_metadata || {};
      await supabase.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...existingAppMetadata,
          webauthnCredentials: filtered,
        },
      });
    }
  } catch (e) {}
  return true;
}

export function resolveRpId(origin?: string): string {
  if (origin) {
    try {
      const url = new URL(origin);
      return url.hostname;
    } catch (e) {}
  }
  if (process.env.APP_URL) {
    try {
      const url = new URL(process.env.APP_URL);
      return url.hostname;
    } catch (e) {}
  }
  return 'localhost';
}

export function getAllowedOrigins(requestOrigin?: string): string[] {
  const origins = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://aamarva.com',
    'https://www.aamarva.com',
  ]);
  if (process.env.APP_URL) {
    try {
      origins.add(new URL(process.env.APP_URL).origin);
    } catch (e) {}
  }
  return Array.from(origins);
}

export async function generateWebAuthnRegistrationOptions(user: any, requestOrigin?: string) {
  const rpID = resolveRpId(requestOrigin);
  const existingCredentials = await getUserWebAuthnCredentials(user.id);
  
  const options = await generateRegistrationOptions({
    rpName: 'AAMARVA Protocol',
    rpID,
    userID: new Uint8Array(Buffer.from(user.id)),
    userName: user.agentId || user.email,
    userDisplayName: user.name || user.agentId,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map(c => ({
      id: c.credentialId,
      transports: c.transports as any,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
    timeout: 60000,
  });

  const challengeId = await createWebAuthnChallenge(user.id, user.agentId, options.challenge, 'register');
  return { options, challengeId };
}

export async function verifyAndSaveWebAuthnRegistration(
  user: any,
  challengeId: string,
  response: any,
  deviceName?: string,
  requestOrigin?: string
) {
  const challengeCheck = await consumeWebAuthnChallenge(challengeId, user.id, 'register');
  if (!challengeCheck.valid || !challengeCheck.challenge) {
    throw new Error(`Registration challenge validation failed: ${challengeCheck.reason || 'Invalid challenge'}`);
  }

  const rpID = resolveRpId(requestOrigin);
  const expectedOrigin = getAllowedOrigins(requestOrigin);
  const expectedRPID = Array.from(new Set([
    rpID,
    'localhost',
    '127.0.0.1',
    'aamarva.com',
    'www.aamarva.com',
  ]));

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challengeCheck.challenge,
    expectedOrigin,
    expectedRPID,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Registration verification failed: Authenticator attestation could not be verified.');
  }

  const { credential } = verification.registrationInfo;
  const credentialRecord: WebAuthnCredentialRecord = {
    id: credential.id,
    userId: user.id,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports,
    deviceName: deviceName?.trim() || 'Passkey Device',
    backedUp: verification.registrationInfo.credentialBackedUp,
    createdAt: new Date().toISOString(),
  };

  await saveUserWebAuthnCredential(user.id, credentialRecord);
  return credentialRecord;
}

export async function generateWebAuthnAuthenticationOptions(
  user: any,
  credentials: WebAuthnCredentialRecord[],
  requestOrigin?: string
) {
  if (!credentials || credentials.length === 0) {
    throw new Error('No registered WebAuthn passkeys found for this account.');
  }

  const rpID = resolveRpId(requestOrigin);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map(c => ({
      id: c.credentialId,
      transports: c.transports as any,
    })),
    userVerification: 'required',
    timeout: 60000,
  });

  const challengeId = await createWebAuthnChallenge(user.id, user.agentId, options.challenge, 'login');
  return { options, challengeId };
}

export async function verifyHumanPassword(data: { agentId: string; password: string }) {
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

  const { passwordHash: _, apiKeyHash: __, ...safeUser } = normalizedUser;
  return safeUser;
}

export async function loginHuman(data: {
  agentId: string;
  password: string;
  challengeId?: string;
  assertion?: any;
  origin?: string;
  rpId?: string;
}) {
  const agentId = (data.agentId || '').trim();
  const password = (data.password || '').trim();

  if (!agentId || !password) {
    throw new Error('Please provide both Agent ID and password.');
  }

  // 1. Password verification
  const safeUser = await verifyHumanPassword({ agentId, password });

  // 2. HARD CONSTRAINT: Password alone cannot create a human session
  if (!data.challengeId || !data.assertion) {
    throw new Error('WebAuthn passkey assertion required: Password verification alone cannot create a human session.');
  }

  // 3. Challenge consumption & account binding
  const challengeCheck = await consumeWebAuthnChallenge(data.challengeId, safeUser.id, 'login');
  if (!challengeCheck.valid || !challengeCheck.challenge) {
    throw new Error(`WebAuthn challenge validation failed: ${challengeCheck.reason || 'Invalid challenge'}`);
  }

  // 4. Retrieve user's registered credentials
  const credentials = await getUserWebAuthnCredentials(safeUser.id);
  if (credentials.length === 0) {
    throw new Error('No registered WebAuthn passkeys found for this account.');
  }

  const matchingCred = credentials.find(
    c => c.credentialId === data.assertion.id || c.credentialId === data.assertion.rawId
  );
  if (!matchingCred) {
    throw new Error('Unrecognized passkey credential. The provided credential is not enrolled for this account.');
  }

  // 5. Verify cryptographic assertion with @simplewebauthn/server
  const expectedOrigin = getAllowedOrigins(data.origin);
  const rpID = resolveRpId(data.origin);
  const expectedRPID = Array.from(new Set([
    rpID,
    'localhost',
    '127.0.0.1',
    'aamarva.com',
    'www.aamarva.com',
    ...(data.rpId ? [data.rpId] : []),
  ]));

  let verificationResult;
  try {
    verificationResult = await verifyAuthenticationResponse({
      response: data.assertion,
      expectedChallenge: challengeCheck.challenge,
      expectedOrigin,
      expectedRPID,
      credential: {
        id: matchingCred.credentialId,
        publicKey: new Uint8Array(Buffer.from(matchingCred.publicKey, 'base64url')),
        counter: matchingCred.counter,
        transports: matchingCred.transports as any,
      },
      requireUserVerification: true,
    });
  } catch (err: any) {
    throw new Error(`WebAuthn assertion verification failed: ${err?.message || 'Cryptographic verification error'}`);
  }

  if (!verificationResult.verified) {
    throw new Error('WebAuthn assertion verification failed: Authenticator signature is invalid.');
  }

  // 6. Update counter
  await updateUserWebAuthnCredentialCounter(
    safeUser.id,
    matchingCred.credentialId,
    verificationResult.authenticationInfo.newCounter
  );

  // 7. Human session creation strictly after WebAuthn verification
  const sessionId = await createHumanSession(safeUser.id);
  return { user: safeUser, sessionId };
}

export async function loginAgent(data: { agentId: string; apiKey: string }, clientIp?: string) {
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

  const normalizedUser = normalizeUserRecord(userRecord, authUser);

  if (clientIp) {
    if (!isIpAllowed(clientIp, normalizedUser.whitelisted_networks)) {
      const err = new Error('Access denied: source network is not authorized.');
      (err as any).statusCode = 403;
      throw err;
    }
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
  const accessToken = generateAccessToken(normalizedUser);
  const refreshToken = generateRefreshToken(normalizedUser.id, familyId);
  await persistRefreshToken(normalizedUser.id, familyId, refreshToken);

  const { passwordHash: _, apiKeyHash: __, ...safeUser } = normalizedUser;

  return { user: safeUser, tokens: { accessToken, refreshToken } };
}
export async function updateUserProfile(userId: string, data: Partial<UserRecord>) {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  
  // Create a clean copy of data to avoid sending unmapped columns
  const updatePayload: Record<string, any> = { ...data, updatedAt: now };
  
  // emailVerified is often handled via app_metadata/cache fallback if the column is missing
  // We'll remove it from the direct update payload to prevent schema errors if the column doesn't exist
  delete updatePayload.emailVerified;
  delete updatePayload.emailVerifiedAt;
  delete updatePayload.whitelisted_networks;
  delete updatePayload.whitelistedNetworks;
  
  const { data: updatedUser, error } = await supabase
    .from('users')
    .update(updatePayload)
    .eq('id', userId)
    .select()
    .maybeSingle();
    
  if (error || !updatedUser) throw new Error(error?.message || 'Failed to update profile');
  
  const { passwordHash: _, apiKeyHash: __, ...safeUser } = normalizeUserRecord(updatedUser);
  return safeUser;
}

export async function updateUserWhitelist(userId: string, networks: any, _clientIp?: string) {
  // 1. Authoritative validation and normalization (defaults to [] if empty)
  const normalizedWL = validateAndNormalizeWhitelist(networks);

  // 2. Atomic database update
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { data: updatedUser, error } = await supabase
    .from('users')
    .update({
      whitelisted_networks: normalizedWL,
      updatedAt: now,
    })
    .eq('id', userId)
    .select()
    .maybeSingle();

  if (error || !updatedUser) {
    throw new Error(`Failed to update network whitelist: ${error?.message || 'User not found'}`);
  }

  // Best-effort sync to Auth app_metadata
  try {
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { whitelisted_networks: normalizedWL },
      app_metadata: { whitelisted_networks: normalizedWL },
    });
  } catch (e) {}

  return {
    whitelisted_networks: normalizedWL,
    user: normalizeUserRecord(updatedUser),
  };
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

  const userEmail = (userBefore.email || '').trim().toLowerCase();

  // --- EXECUTE DELETIONS IN BOTTOM-UP DEPENDENCY ORDER (with database cascade as safety net) ---

  // Step 1: Delete Messages sent by the user
  await supabase.from('messages').delete().eq('senderUserId', userId);

  // Step 2: Delete Connection Requests involving the user
  await supabase.from('connection_requests').delete().eq('senderUserId', userId);
  await supabase.from('connection_requests').delete().eq('receiverUserId', userId);

  // Step 3: Delete Connections involving the user
  await supabase.from('connections').delete().eq('postOwnerUserId', userId);
  await supabase.from('connections').delete().eq('replyAuthorUserId', userId);

  // Step 4: Delete Reviews authored by the user
  try {
    await supabase.from('reviews').delete().eq('reviewerUserId', userId);
  } catch (e) {
    // Non-fatal if table doesn't have records or review deletion handled by DB cascade
  }

  // Step 5: Delete Replies written by the user
  await supabase.from('replies').delete().eq('userId', userId);

  // Step 6: Delete Posts authored by the user
  await supabase.from('posts').delete().eq('userId', userId);

  // Step 7: Delete Agent Footprints & External Events
  try {
    await supabase.from('agent_footprints').delete().eq('user_id', userId);
  } catch (e) {}
  try {
    await supabase.from('agent_footprints').delete().eq('userId', userId);
  } catch (e) {}
  try {
    await supabase.from('external_events').delete().eq('user_id', userId);
  } catch (e) {}
  try {
    await supabase.from('external_events').delete().eq('userId', userId);
  } catch (e) {}

  // Step 8: Delete Account Audit Logs for this agent
  if (userBefore.agentId) {
    try {
      await supabase.from('account_audit_logs').delete().eq('agentId', userBefore.agentId);
    } catch (e) {}
  }

  // Step 9: Delete All Database Auth Records (Human Sessions, Password Reset Tokens, Refresh Tokens)
  await invalidateAllHumanSessionsForUser(userId);
  await supabase.from('human_sessions').delete().eq('userId', userId);
  await supabase.from('password_reset_tokens').delete().eq('userId', userId);
  await supabase.from('refresh_tokens').delete().eq('userId', userId);

  // Step 10: Delete User Record from database
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

  // Step 11: Cascade and Purge all Supabase Auth records for this user (both by ID and by email)
  try {
    if (supabase.auth?.admin?.deleteUser) {
      // A. Delete directly by known userId
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteError) {
        if (deleteError.message?.toLowerCase().includes('not found')) {
          console.warn(`[Account Deletion Warning] Corresponding Auth user for ID ${userId} was not found in Supabase Auth.`);
        } else {
          console.error('[Account Deletion Error] Failed to delete Supabase Auth user directly:', deleteError);
        }
      } else {
        console.log(`[Account Deletion] Successfully deleted Supabase Auth user ID: ${userId}`);
      }

      // B. Purge all matching or old auth records for this user's email to prevent orphaned credentials
      if (userEmail) {
        try {
          const { data: listResult, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
          if (!listErr && listResult?.users) {
            const matchingAuthUsers = listResult.users.filter(
              (u: any) => normalizeEmail(u.email || '') === userEmail
            );
            for (const oldAuth of matchingAuthUsers) {
              console.log(`[Account Deletion] Purging matching/old Supabase Auth record ${oldAuth.id} for email ${userEmail}`);
              await supabase.auth.admin.deleteUser(oldAuth.id);
            }
          }
        } catch (listErr) {
          console.warn('[Account Deletion] Warning searching for old auth records by email:', listErr);
        }
      }
    }
  } catch (e: any) {
    console.error('[Account Deletion Error] Supabase Auth admin delete exception:', e?.message || e);
  }

  // Step 12: Invalidate in-memory auth caches
  invalidateAuthCache();
}

export async function logoutHumanSession(rawSessionId?: string) {
  if (rawSessionId) {
    await invalidateHumanSession(rawSessionId);
  }
}

export async function logoutAgent(userId: string, refreshToken?: string) {
  try {
  } catch (e) {}
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

export async function refreshSessionToken(token: string, clientIp?: string): Promise<{ user: Omit<UserRecord, 'passwordHash'>; tokens: AuthTokens }> {
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

  if (clientIp) {
    if (!isIpAllowed(clientIp, user.whitelisted_networks)) {
      const err = new Error('Access denied: source network is not authorized.');
      (err as any).statusCode = 403;
      throw err;
    }
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
      emailVerified: false,
      emailVerifiedAt: null,
      updatedAt: new Date().toISOString() 
    })
    .ilike('email', oldEmail || '');

  if (dbError) throw new Error('Failed to update account record.');

  // b. Update Supabase Auth email and clear pending metadata
  const { error: authError } = await supabase.auth.admin.updateUserById(targetAuthUser.id, {
    email: pendingData.newEmail,
    email_confirm: true, // required by supabase to confirm the new email change
    app_metadata: { 
      ...targetAuthUser.app_metadata, 
      emailVerified: false,
      emailVerifiedAt: null,
      pendingEmailChange: null 
    }
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
 * Requests an account email verification link.
 * Sent when user signs up or requests verification from their Dashboard.
 */
export async function requestAccountVerificationEmail(userId: string, customAppUrl?: string) {
  const supabase = getSupabaseClient();

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, agentId, email, name')
    .eq('id', userId)
    .maybeSingle();

  if (userErr || !user) {
    throw new Error('User account not found.');
  }

  // Check if account is already verified in the database (sole source of truth)
  if (user.emailVerified === true) {
    return { success: true, message: 'Your account is already verified with a tick mark.', alreadyVerified: true };
  }

  const { data: authUserData } = await supabase.auth.admin.getUserById(user.id);
  const authUser = authUserData?.user;

  // Generate crypto secure verification token
  const secret = crypto.randomBytes(32).toString('hex');
  const token = `${user.id}.${secret}`;
  const tokenHash = crypto.createHash('sha256').update(secret).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  // Update pendingEmailVerification in auth user's app_metadata
  const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...authUser?.app_metadata,
      pendingEmailVerification: {
        email: user.email,
        tokenHash,
        expiresAt,
      },
    },
  });

  if (updateErr) {
    throw new Error(`Failed to generate verification request: ${updateErr.message}`);
  }

  const appUrl = customAppUrl || process.env.APP_URL || config.appUrl || 'https://aamarva.com';
  await sendAccountVerificationEmail(user.email, token, appUrl, user.name);

  return { 
    success: true, 
    message: `Verification link sent to ${user.email}. Please check your inbox and click the link to activate your verified tick mark.` 
  };
}

/**
 * Confirms account email verification via link token.
 * Assigns the verified tick mark to the account.
 */
export async function confirmAccountEmailVerification(token: string) {
  if (!token || !token.includes('.')) {
    throw new Error('Invalid verification token format.');
  }

  const parts = token.split('.');
  const userId = parts[0];
  const secret = parts.slice(1).join('.');
  const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

  const supabase = getSupabaseClient();
  const { data: authUserData, error: authUserErr } = await supabase.auth.admin.getUserById(userId);

  if (authUserErr || !authUserData?.user) {
    throw new Error('Invalid or expired verification token.');
  }

  const authUser = authUserData.user;
  const pending = authUser.app_metadata?.pendingEmailVerification;

  if (!pending) {
    // Check authoritative database table just in case they are already verified
    const { data: existingUser } = await supabase.from('users').select('agentId, email, emailVerified').eq('id', userId).maybeSingle();
    if (existingUser?.emailVerified === true) {
      return {
        success: true,
        message: 'Your account is already verified! The verified tick mark is active.',
        agentId: existingUser.agentId,
        email: existingUser.email,
      };
    }
    throw new Error('No pending email verification found. The link may have already been used.');
  }

  if (pending.tokenHash !== secretHash && pending.tokenHash !== crypto.createHash('sha256').update(token).digest('hex')) {
    throw new Error('Invalid or already used verification token.');
  }

  if (new Date(pending.expiresAt).getTime() < Date.now()) {
    // Clear expired token
    await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { ...authUser.app_metadata, pendingEmailVerification: null },
    });
    throw new Error('Verification link has expired. Please request a new verification link from your Dashboard.');
  }

  // 1. Mark verified in Supabase Auth app_metadata
  const now = new Date().toISOString();
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    email_confirm: true,
    app_metadata: {
      ...authUser.app_metadata,
      emailVerified: true,
      emailVerifiedAt: now,
      pendingEmailVerification: null,
    },
  });

  if (updateError) {
    throw new Error(`Failed to update account verification status in auth: ${updateError.message}`);
  }

  // 1b. Mark verified in users database table for permanent persistence
  const { error: dbUpdateError } = await supabase
    .from('users')
    .update({
      emailVerified: true,
      emailVerifiedAt: now,
      updatedAt: now
    })
    .eq('id', userId);

  if (dbUpdateError) {
    // Rollback auth state to maintain consistency
    await supabase.auth.admin.updateUserById(userId, {
      email_confirm: false,
      app_metadata: authUser.app_metadata,
    });
    console.error(`[AccountVerification] Database update failed for user ${userId}:`, dbUpdateError.message);
    throw new Error('Verification failed: Could not synchronize authoritative database.');
  }

  // 2. Fetch user profile from database to get canonical agentId
  const { data: userDb } = await supabase
    .from('users')
    .select('id, agentId, email')
    .eq('id', userId)
    .maybeSingle();

  const agentId = userDb?.agentId || authUser.user_metadata?.agentId || '';
  const email = userDb?.email || authUser.email || '';

  console.log(`[AccountVerification] Successfully verified email and assigned verified tick mark to agent: @${agentId} (${userId})`);

  return {
    success: true,
    message: 'Email successfully verified! Your account has now been assigned the official Verified Tick Mark.',
    agentId,
    email,
  };
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
  const genericMessage = "If an account exists for this email, password reset instructions have been sent.";

  if (!email || typeof email !== 'string') {
    return { success: true, message: genericMessage };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!validateEmailFormat(normalizedEmail)) {
    return { success: true, message: genericMessage };
  }

  const supabase = getSupabaseClient();
  const user = await findUserByEmail(supabase, normalizedEmail);

  if (!user) {
    // Return generic message without revealing that the user does not exist
    return { success: true, message: genericMessage };
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
      return { success: true, message: genericMessage };
    }
  } catch (err: any) {
    console.error('[DIAGNOSTIC_LOG] [AUTH_SERVICE] ❌ Exception storing password reset token in Supabase:', err?.message || err);
    return { success: true, message: genericMessage };
  }

  // 3. Send email through Brevo email service using server-side configuration
  const targetAppUrl = appUrl || process.env.APP_URL || config.appUrl || 'https://aamarva.com';
  try {
    await sendPasswordResetEmail(user.email, rawToken, targetAppUrl, user.name);
  } catch (emailErr: any) {
    console.error('[DIAGNOSTIC_LOG] [AUTH_SERVICE] ❌ Failed to dispatch password reset email:', emailErr?.message || emailErr);
    return { success: true, message: genericMessage };
  }

  return { success: true, message: genericMessage };
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




