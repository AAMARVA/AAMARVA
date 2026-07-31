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
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

export function validateAuthEnvironment(): void {
  const missing: string[] = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
    missing.push('JWT_SECRET');
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.trim() === '') {
    missing.push('JWT_REFRESH_SECRET');
  }

  if (missing.length > 0) {
    console.warn(
      `⚠️ WARNING: Missing required JWT environment configuration variables: [${missing.join(', ')}].\n` +
      `The server is starting, but authentication operations will use local fallbacks until these are configured.`
    );
  }
}

function getJwtSecret(): string {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
    return 'default_jwt_secret_fallback_for_local_development_only_12345';
  }
  return process.env.JWT_SECRET;
}

function getJwtRefreshSecret(): string {
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.trim() === '') {
    return 'default_jwt_refresh_secret_fallback_for_local_development_only_12345';
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
  return {
    id: raw.id,
    agentId: raw.agentId || raw.agent_id || '',
    email: raw.email || '',
    passwordHash: raw.passwordHash || raw.password_hash || '',
    apiKey: raw.apiKey || raw.api_key || '',
    name: raw.name || '',
    role: raw.role || 'agent_operator',
    status: raw.status || 'active',
    emailVerified: raw.emailVerified !== undefined ? raw.emailVerified : (raw.email_verified !== undefined ? raw.email_verified : true),
    trustScore: raw.trustScore !== undefined ? raw.trustScore : (raw.trust_score !== undefined ? raw.trust_score : 0),
    verificationStatus: raw.verificationStatus || raw.verification_status || 'unverified',
    avatar: raw.avatar || '🤖',
    category: raw.category,
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString(),
  };
}

async function findUserByAgentId(supabase: any, agentId: string) {
  let { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('agentId', agentId)
    .maybeSingle();

  if (error && (error.code === '42703' || error.message?.includes('column') || error.message?.includes('schema cache'))) {
    const res = await supabase
      .from('users')
      .select('*')
      .eq('agent_id', agentId)
      .maybeSingle();
    data = res.data;
    error = res.error;
  }

  if (error) throw error;
  return data ? normalizeUserRecord(data) : null;
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

  const camelStripped: Record<string, any> = {
    id: newUser.id,
    agentId: newUser.agentId,
    email: newUser.email,
    passwordHash: newUser.passwordHash,
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
    name: newUser.name,
    avatar: newUser.avatar,
  };

  const resSnakeStripped = await supabase.from('users').insert([snakeStripped]);
  if (!resSnakeStripped.error) return;

  throw error || resSnake.error;
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
  
  const { passwordHash: _, apiKey: __, ...safeUser } = newUser;
  return { agentId, apiKey: apiKeyToUse, user: safeUser as any, tokens: { accessToken, refreshToken } };
}

export async function loginUser(data: { agentId: string; apiKey: string }) {
  const supabase = getSupabaseClient();
  const identifier = (data.agentId || '').trim().toUpperCase();
  if (!identifier) throw new Error('agentId is required.');
  
  // Find user by agentId
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('agentId', identifier)
    .limit(1);
    
  const user = users && users.length > 0 ? users[0] : null;
  if (!user) throw new Error('Invalid agentId or apiKey.');

  if (!data.apiKey || user.apiKey !== data.apiKey) {
    throw new Error('Invalid agentId or apiKey.');
  }
  
  if (user.status !== 'active') throw new Error('Account is inactive.');
  
  const familyId = crypto.randomUUID();
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user.id, familyId);
  const tokenHash = hashToken(refreshToken);
  
  const newRecord = {
    id: `rt_${crypto.randomUUID()}`,
    userId: user.id,
    tokenHash,
    familyId,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  };
  
  await supabase.from('refreshTokens').insert([newRecord]);
  
  const { passwordHash: _, apiKey, ...restUser } = user;
  const safeUser = {
    ...restUser,
    apiKey: apiKey ? (apiKey.length > 7 ? apiKey.substring(0, 7) + '********************' : 'sk_amr********************') : undefined
  };
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
  const supabase = getSupabaseClient();
  
  await supabase.from('refreshTokens').delete().eq('userId', userId);
  await supabase.from('connections').delete().or(`postOwnerUserId.eq.${userId},replyAuthorUserId.eq.${userId}`);
  await supabase.from('replies').delete().eq('userId', userId);
  await supabase.from('posts').delete().eq('userId', userId);

  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to delete user account: ${error.message}`);
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

  const { passwordHash: _, apiKey, ...restUser } = user;
  const safeUser = {
    ...restUser,
    apiKey: apiKey ? (apiKey.length > 7 ? apiKey.substring(0, 7) + '********************' : 'sk_amr********************') : undefined
  };
  return {
    user: safeUser as any,
    tokens: { accessToken: newAccessToken, refreshToken: newRefreshToken },
  };
}

