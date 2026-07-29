import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserRecord, RefreshTokenRecord } from './db.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';
import { users as localUsers, refreshTokens as localRefreshTokens } from './localDb.js';

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

export async function registerUser(data: {
  email: string;
  password: string;
  name?: string;
  agentName?: string;
  agentId?: string;
}): Promise<{ user: Omit<UserRecord, 'passwordHash'>; tokens: AuthTokens }> {
  const normalizedEmail = normalizeEmail(data.email);

  if (!validateEmailFormat(normalizedEmail)) {
    throw new Error('Invalid email address format.');
  }

  const passwordCheck = validatePasswordStrength(data.password);
  if (!passwordCheck.valid) {
    throw new Error(passwordCheck.message || 'Password is required.');
  }

  if (!isSupabaseConfigured()) {
    // Check existing local user by email
    const existingEmailUser = localUsers.find(u => u.email === normalizedEmail);
    if (existingEmailUser) {
      throw new Error('A user with this email address already exists.');
    }

    let finalAgentId = '';
    if (data.agentId && data.agentId.trim() !== '') {
      const trimmed = data.agentId.trim().toUpperCase();
      const existingAgent = localUsers.find(u => u.agentId.toUpperCase() === trimmed);
      if (existingAgent) {
        throw new Error('This Agent ID is already taken. Please choose another one.');
      }
      finalAgentId = trimmed;
    } else {
      let isUnique = false;
      let candidate = '';
      while (!isUnique) {
        candidate = generateAgentId();
        const existingAgent = localUsers.find(u => u.agentId.toUpperCase() === candidate.toUpperCase());
        if (!existingAgent) {
          isUnique = true;
        }
      }
      finalAgentId = candidate;
    }

    const passwordHash = await hashPassword(data.password);
    const userId = `usr_${crypto.randomUUID()}`;
    const agentId = finalAgentId;
    const displayName = data.agentName || data.name || normalizedEmail.split('@')[0];
    const now = new Date().toISOString();

    const newUser: UserRecord = {
      id: userId,
      agentId,
      email: normalizedEmail,
      passwordHash,
      name: displayName,
      role: 'agent_operator',
      status: 'active',
      emailVerified: true,
      bio: `Autonomous AI agent operating under ID ${agentId}.`,
      trustScore: 0,
      verificationStatus: 'unverified',
      avatar: '🤖',
      createdAt: now,
      updatedAt: now,
    };

    localUsers.push(newUser);

    // Generate tokens
    const accessToken = generateAccessToken(newUser);
    const familyId = crypto.randomUUID();
    const refreshToken = generateRefreshToken(userId, familyId);
    const tokenHash = hashToken(refreshToken);

    const refreshTokenRecord: RefreshTokenRecord = {
      id: `rt_${crypto.randomUUID()}`,
      userId,
      tokenHash,
      familyId,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
    };

    localRefreshTokens.push(refreshTokenRecord);

    const { passwordHash: _, ...safeUser } = newUser;
    return {
      user: safeUser,
      tokens: { accessToken, refreshToken },
    };
  }

  const supabase = getSupabaseClient();

  // Check existing user by email
  const { data: existingEmailUser, error: emailCheckError } = await supabase
    .from('users')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (emailCheckError) {
    throw new Error(`Database error during registration lookup: ${emailCheckError.message}`);
  }

  if (existingEmailUser) {
    throw new Error('A user with this email address already exists.');
  }

  let finalAgentId = '';
  if (data.agentId && data.agentId.trim() !== '') {
    const trimmed = data.agentId.trim().toUpperCase();
    const { data: existingAgent, error: agentCheckError } = await supabase
      .from('users')
      .select('id')
      .eq('agentId', trimmed)
      .maybeSingle();

    if (agentCheckError) {
      throw new Error(`Database error during agent ID lookup: ${agentCheckError.message}`);
    }

    if (existingAgent) {
      throw new Error('This Agent ID is already taken. Please choose another one.');
    }
    finalAgentId = trimmed;
  } else {
    let isUnique = false;
    let candidate = '';
    while (!isUnique) {
      candidate = generateAgentId();
      const { data: existingAgent, error: genCheckError } = await supabase
        .from('users')
        .select('id')
        .eq('agentId', candidate)
        .maybeSingle();

      if (genCheckError) {
        throw new Error(`Database error during agent ID generation: ${genCheckError.message}`);
      }

      if (!existingAgent) {
        isUnique = true;
      }
    }
    finalAgentId = candidate;
  }

  const passwordHash = await hashPassword(data.password);
  const userId = `usr_${crypto.randomUUID()}`;
  const agentId = finalAgentId;
  const displayName = data.agentName || data.name || normalizedEmail.split('@')[0];
  const now = new Date().toISOString();

  const newUser: UserRecord = {
    id: userId,
    agentId,
    email: normalizedEmail,
    passwordHash,
    name: displayName,
    role: 'agent_operator',
    status: 'active',
    emailVerified: true,
    bio: `Autonomous AI agent operating under ID ${agentId}.`,
    trustScore: 0,
    verificationStatus: 'unverified',
    avatar: '🤖',
    createdAt: now,
    updatedAt: now,
  };

  const { error: insertUserError } = await supabase
    .from('users')
    .insert([newUser]);

  if (insertUserError) {
    throw new Error(`Failed to create user record: ${insertUserError.message}`);
  }

  // Generate tokens
  const accessToken = generateAccessToken(newUser);
  const familyId = crypto.randomUUID();
  const refreshToken = generateRefreshToken(userId, familyId);
  const tokenHash = hashToken(refreshToken);

  const refreshTokenRecord: RefreshTokenRecord = {
    id: `rt_${crypto.randomUUID()}`,
    userId,
    tokenHash,
    familyId,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now,
  };

  const { error: insertTokenError } = await supabase
    .from('refreshTokens')
    .insert([refreshTokenRecord]);

  if (insertTokenError) {
    throw new Error(`Failed to save session token: ${insertTokenError.message}`);
  }

  const { passwordHash: _, ...safeUser } = newUser;
  return {
    user: safeUser,
    tokens: { accessToken, refreshToken },
  };
}

export async function loginUser(data: {
  identifier?: string;
  agentId?: string;
  email?: string;
  password: string;
}): Promise<{ user: Omit<UserRecord, 'passwordHash'>; tokens: AuthTokens }> {
  const rawIdentifier = data.identifier || data.agentId || data.email || '';
  const loginIdentifier = rawIdentifier.trim();

  if (!loginIdentifier || !data.password) {
    throw new Error('Identifier (Email or Agent ID) and password are required.');
  }

  if (!isSupabaseConfigured()) {
    const user = localUsers.find(
      u => u.email.toLowerCase() === loginIdentifier.toLowerCase() ||
           u.agentId.toLowerCase() === loginIdentifier.toLowerCase()
    );

    const dummyHash = '$2a$12$eImiTXuWVxfM37uY4JANjO4iWl86L/t2W40/uW.0gM6.gK4R0pCey';
    const targetHash = user ? user.passwordHash : dummyHash;

    const isPasswordValid = await comparePassword(data.password, targetHash);

    if (!user || !isPasswordValid) {
      throw new Error('Invalid credentials provided.');
    }

    if (user.status !== 'active') {
      throw new Error('This account has been suspended or deactivated.');
    }

    const accessToken = generateAccessToken(user);
    const familyId = crypto.randomUUID();
    const refreshToken = generateRefreshToken(user.id, familyId);
    const tokenHash = hashToken(refreshToken);
    const now = new Date().toISOString();

    const refreshTokenRecord: RefreshTokenRecord = {
      id: `rt_${crypto.randomUUID()}`,
      userId: user.id,
      tokenHash,
      familyId,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
    };

    localRefreshTokens.push(refreshTokenRecord);

    const { passwordHash: _, ...safeUser } = user;
    return {
      user: safeUser,
      tokens: { accessToken, refreshToken },
    };
  }

  const supabase = getSupabaseClient();
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .or(`email.ilike.${loginIdentifier},agentId.ilike.${loginIdentifier}`)
    .maybeSingle();

  if (userError) {
    throw new Error(`Database error during user authentication lookup: ${userError.message}`);
  }

  const dummyHash = '$2a$12$eImiTXuWVxfM37uY4JANjO4iWl86L/t2W40/uW.0gM6.gK4R0pCey';
  const targetHash = user ? user.passwordHash : dummyHash;

  const isPasswordValid = await comparePassword(data.password, targetHash);

  if (!user || !isPasswordValid) {
    throw new Error('Invalid credentials provided.');
  }

  if (user.status !== 'active') {
    throw new Error('This account has been suspended or deactivated.');
  }

  const accessToken = generateAccessToken(user);
  const familyId = crypto.randomUUID();
  const refreshToken = generateRefreshToken(user.id, familyId);
  const tokenHash = hashToken(refreshToken);
  const now = new Date().toISOString();

  const refreshTokenRecord: RefreshTokenRecord = {
    id: `rt_${crypto.randomUUID()}`,
    userId: user.id,
    tokenHash,
    familyId,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now,
  };

  const { error: insertTokenError } = await supabase
    .from('refreshTokens')
    .insert([refreshTokenRecord]);

  if (insertTokenError) {
    throw new Error(`Failed to save session token: ${insertTokenError.message}`);
  }

  const { passwordHash: _, ...safeUser } = user;
  return {
    user: safeUser,
    tokens: { accessToken, refreshToken },
  };
}

