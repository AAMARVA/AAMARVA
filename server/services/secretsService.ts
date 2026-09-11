import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getSupabaseClient } from '../supabase.js';

/**
 * Public metadata representation of a preserved secret.
 * NEVER includes raw secretValue or plaintext.
 */
export interface PreservedSecretMetadata {
  id: string;
  keyName: string;
  masked: string;
  createdAt: string;
}

/**
 * Encrypted-at-rest representation of a preserved secret.
 * Encrypted using AES-256-GCM with a unique 12-byte IV and 16-byte auth tag.
 */
export interface EncryptedSecretRecord {
  id: string;
  keyName: string;
  encryptedValue: string; // Base64 ciphertext
  iv: string; // Base64 12-byte IV
  tag: string; // Base64 16-byte Auth Tag
  length: number; // Length of the secret string
  createdAt: string;
}

/**
 * Input format for saving secrets.
 */
export interface SaveSecretInput {
  id?: string;
  keyName?: string;
  secretValue: string;
  createdAt?: string;
}

/**
 * Derives a 32-byte key for AES-256-GCM.
 * The primary key MUST be provided via process.env.SECRETS_ENCRYPTION_KEY.
 * No hardcoded or weak fallback keys are permitted in any environment.
 */
export function getEncryptionKey(): Buffer {
  const envKey = process.env.SECRETS_ENCRYPTION_KEY;
  if (!envKey || !envKey.trim()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[Security Configuration Error] SECRETS_ENCRYPTION_KEY environment variable is required in production. Generate one using: openssl rand -hex 32'
      );
    }
    // Development fallback: derive deterministically from JWT_SECRET or fallback seed.
    const devSeed = process.env.JWT_SECRET || 'aamarva-dev-fallback-seed-4923';
    return crypto.createHash('sha256').update(`aamarva-dev-key:${devSeed}`).digest();
  }

  const trimmed = envKey.trim();
  // 64-character hex string (32 raw bytes)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  // High-entropy passphrase (must be at least 32 characters)
  if (trimmed.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[Security Configuration Error] SECRETS_ENCRYPTION_KEY is too weak. It must be either a 64-character hex string (32 bytes) or a passphrase of at least 32 characters.'
      );
    }
    // Weaker keys permitted in development
  }

  return crypto.createHash('sha256').update(`aamarva-secrets-key:${trimmed}`).digest();
}

/**
 * Encrypts a secret value using AES-256-GCM.
 */
function encryptSecretValue(plainText: string): { encryptedValue: string; iv: string; tag: string; length: number } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    length: plainText.length,
  };
}

/**
 * Decrypts an encrypted secret record using AES-256-GCM.
 * If decryption fails or authentication tag is invalid, returns null.
 */
function decryptSecretRecord(record: EncryptedSecretRecord): string | null {
  try {
    if (!record.encryptedValue || !record.iv || !record.tag) {
      return null;
    }
    const key = getEncryptionKey();
    const iv = Buffer.from(record.iv, 'base64');
    const tag = Buffer.from(record.tag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(record.encryptedValue, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // Log failure without printing secret values or ciphertexts
    console.error(`[secretsService] Decryption failed for secret id: ${record.id}`);
    return null;
  }
}

/**
 * Escapes regex special characters in a string.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces all occurrences of any preserved secret value with asterisks matching the content length or '******'.
 * Sorts secret values by length descending so longer substrings get replaced first.
 */
export function maskSecretWords(text: string, secretValues: string[]): string {
  if (!text || typeof text !== 'string') return text;
  if (!Array.isArray(secretValues) || secretValues.length === 0) return text;

  const validSecrets = secretValues
    .filter(s => typeof s === 'string' && s.length > 0)
    .sort((a, b) => b.length - a.length);

  let sanitized = text;
  for (const sec of validSecrets) {
    const escaped = escapeRegExp(sec);
    const regex = new RegExp(escaped, 'g');
    sanitized = sanitized.replace(regex, '******');
  }

  return sanitized;
}

/**
 * Automatically masks AAMARVA API keys, JWT access/refresh tokens, and request credentials with '******'.
 * Does not require manual enrollment in Secrets Preserver.
 */
export function maskBuiltInCredentials(text: string, contextCredentials: string[] = []): string {
  if (!text || typeof text !== 'string') return text;

  let sanitized = text;

  // 1. Mask known AAMARVA API Key formats (sk_amr_..., amr_live_...)
  const apiKeyPattern = /\b(?:sk_amr_[0-9a-zA-Z_-]{20,80}|amr_live_[0-9a-zA-Z_-]{20,80})\b/g;
  sanitized = sanitized.replace(apiKeyPattern, '******');

  // 2. Mask JWT access / refresh / session tokens (header.payload.signature)
  const jwtPattern = /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g;
  sanitized = sanitized.replace(jwtPattern, '******');

  // 3. Mask any specific request-context credentials passed (e.g. current API key, Bearer token, refresh token, request password)
  if (Array.isArray(contextCredentials) && contextCredentials.length > 0) {
    const validContextCreds = contextCredentials
      .filter(c => typeof c === 'string' && c.trim().length >= 6)
      .map(c => c.trim())
      .sort((a, b) => b.length - a.length);

    for (const cred of validContextCreds) {
      const escaped = escapeRegExp(cred);
      const regex = new RegExp(escaped, 'g');
      sanitized = sanitized.replace(regex, '******');
    }
  }

  return sanitized;
}

/**
 * Detects phone numbers deterministically across international and national formats.
 * Avoids false positives on dates (2026-09-10), times (13:54:02), versions (v1.0.0, 6.4.3),
 * UUIDs/hex strings, IDs (AMR-8F3A2B), currency ($100.00), and ordinary short numbers.
 */
export function containsPhoneNumber(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  // 1. Check for international format explicitly with '+' prefix
  // e.g. +91 98765 43210, +919876543210, +1 (800) 555-0199, +44 20 7946 0958, +1-555-123-4567
  const intlWithPlus = /\+\s*\d(?:[-.\s()]*\d){6,14}\b/;
  if (intlWithPlus.test(text)) {
    return true;
  }

  // Pre-filter known non-phone numeric formats from a working copy of text
  const scrubbed = text
    // ISO Dates (e.g. 2026-09-10, 2026/09/10, 10-09-2026, 10/09/2026)
    .replace(/\b(?:\d{4}[-/.]\d{2}[-/.]\d{2}|\d{2}[-/.]\d{2}[-/.]\d{4})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/gi, ' ')
    // Timestamps / clock times (e.g. 13:54:02, 13:54)
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    // Version numbers (e.g. 6.4.3, 1.0.0, v2.1.0)
    .replace(/\bv?\d+\.\d+(?:\.\d+)+\b/gi, ' ')
    // UUIDs & hex IDs (contain letters and hyphens)
    .replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, ' ')
    // Identifiers with alphanumeric mixes (e.g. AMR-8F3A2B, post_123, order456, #12345)
    .replace(/\b[a-zA-Z0-9_-]*[a-zA-Z][a-zA-Z0-9_-]*\b/g, ' ')
    // Currency or percent amounts (e.g. $100.00, 50%, €25.50)
    .replace(/[$€£¥₹]\s*\d+(?:,\d{3})*(?:\.\d+)?/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*%/g, ' ');

  // 2. National / local formats starting with 0 (e.g. 09876543210, 020 7946 0958, 0800 123 456)
  const zeroPrefixRegex = /\b0(?:[-.\s()]*\d){9,11}\b/;
  if (zeroPrefixRegex.test(scrubbed)) {
    return true;
  }

  // 3. Formats with area code parenthesis: e.g. (123) 456-7890, (123)456-7890
  const parenAreaRegex = /\(\s*\d{2,4}\s*\)[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/;
  if (parenAreaRegex.test(scrubbed)) {
    return true;
  }

  // 4. Segmented 10-digit number patterns (5+5, 3+3+4, 3+4+3, 4+3+3)
  // e.g. 98765 43210, 98765-43210, 98765.43210
  const fiveFiveRegex = /\b\d{5}[-.\s]\d{5}\b/;
  if (fiveFiveRegex.test(scrubbed)) {
    return true;
  }

  // e.g. 123-456-7890, 123 456 7890, 123.456.7890, 0123-456-789
  const standardDelimited = /\b\d{2,4}[-.\s]\d{3,4}[-.\s]\d{3,4}\b/;
  if (standardDelimited.test(scrubbed)) {
    return true;
  }

  // 5. Consecutive 10-12 standalone digits (e.g. 9876543210)
  const tenToTwelveDigits = /\b\d{10,12}\b/;
  if (tenToTwelveDigits.test(scrubbed)) {
    return true;
  }

  return false;
}

/**
 * Detects email addresses deterministically, including standard RFC formats and common obfuscation patterns.
 * Does not block ordinary agent mentions (@agent1, @AMR-8F3A2B) or ordinary uses of @ symbol without a domain.
 */
export function containsEmailAddress(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  // 1. Standard email: user@domain.tld or user.name+tag@sub.domain.tld
  const standardEmailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
  if (standardEmailRegex.test(text)) {
    return true;
  }

  // 2. Obfuscated @ patterns:
  // e.g., john [at] example.com, john (at) example.com, john @ example.com, john {at} example.com, john at example.com
  // with either standard dot or obfuscated [dot], (dot), {dot}, dot
  const obfuscatedEmailRegex = /\b[A-Za-z0-9._%+-]+\s*(?:\[at\]|\(at\)|\{at\}|@|\bat\b)\s*[A-Za-z0-9.-]+\s*(?:\.|\s*\[dot\]\s*|\s*\(dot\)\s*|\s*\{dot\}\s*|\s+dot\s+)[A-Za-z]{2,}\b/i;
  if (obfuscatedEmailRegex.test(text)) {
    return true;
  }

  // 3. Compact bracketed notation: john[at]example.com or john[at]example[dot]com
  const compactBracketedRegex = /\b[A-Za-z0-9._%+-]+(?:\[at\]|\(at\))[A-Za-z0-9.-]+(?:\.|\s*\[dot\]\s*|\s*\(dot\)\s*)[A-Za-z]{2,}\b/i;
  if (compactBracketedRegex.test(text)) {
    return true;
  }

  return false;
}

/**
 * Masks contact information (phone numbers and email addresses) in text with a non-revealing redacted placeholder.
 */
export function maskContactInfo(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let sanitized = text;

  // 1. Mask international / formatted phone numbers
  sanitized = sanitized.replace(/\+\s*\d(?:[-.\s()]*\d){6,14}\b/g, '[Contact Info Redacted]');
  sanitized = sanitized.replace(/\b00?(?:[-.\s()]*\d){8,12}\b/g, '[Contact Info Redacted]');
  sanitized = sanitized.replace(/\(\s*0?\d{1,5}\s*\)[-.\s]?(?:[-.\s()]*\d){5,11}\b/g, '[Contact Info Redacted]');
  sanitized = sanitized.replace(/\b\d{5}[-.\s]\d{5}\b/g, '[Contact Info Redacted]');
  sanitized = sanitized.replace(/\b\d{2,4}[-.\s]\d{3,4}[-.\s]\d{3,4}\b/g, '[Contact Info Redacted]');
  sanitized = sanitized.replace(/\b\d{10,12}\b/g, '[Contact Info Redacted]');

  // 2. Mask email addresses (standard and obfuscated)
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[Contact Info Redacted]');
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+\s*(?:\[at\]|\(at\)|\{at\}|@|\bat\b)\s*[A-Za-z0-9.-]+\s*(?:\.|\s*\[dot\]\s*|\s*\(dot\)\s*|\s*\{dot\}\s*|\s+dot\s+)[A-Za-z]{2,}\b/gi, '[Contact Info Redacted]');
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+(?:\[at\]|\(at\))[A-Za-z0-9.-]+(?:\.|\s*\[dot\]\s*|\s*\(dot\)\s*)[A-Za-z]{2,}\b/gi, '[Contact Info Redacted]');

  return sanitized;
}

/**
 * Validates text to ensure no phone numbers or email addresses are present.
 * Throws a non-revealing 400 error if contact information is detected.
 */
export function validateContentForContactInfo(text: string): void {
  if (containsPhoneNumber(text)) {
    const err: any = new Error('Contact information detected: Phone numbers are not permitted in transmissions.');
    err.status = 400;
    err.code = 'CONTACT_INFO_BLOCKED';
    throw err;
  }

  if (containsEmailAddress(text)) {
    const err: any = new Error('Contact information detected: Email addresses are not permitted in transmissions.');
    err.status = 400;
    err.code = 'CONTACT_INFO_BLOCKED';
    throw err;
  }
}

/**
 * Loads encrypted secret records for a user from Supabase Auth user_metadata.
 * Automatically performs backward-compatible migration if legacy plaintext records exist.
 */
async function loadUserEncryptedRecords(userId: string): Promise<EncryptedSecretRecord[]> {
  const supabase = getSupabaseClient();
  try {
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError || !authData?.user) {
      return [];
    }

    const metadata = authData.user.user_metadata || {};

    // 1. Check if modern encrypted records exist
    if (Array.isArray(metadata.encrypted_preserved_secrets) && metadata.encrypted_preserved_secrets.length > 0) {
      return metadata.encrypted_preserved_secrets as EncryptedSecretRecord[];
    }

    // 2. Backward-compatibility migration: check for legacy plaintext 'preserved_secrets'
    if (Array.isArray(metadata.preserved_secrets) && metadata.preserved_secrets.length > 0) {
      const legacyList = metadata.preserved_secrets;
      const migratedRecords: EncryptedSecretRecord[] = [];

      for (const legacy of legacyList) {
        if (legacy && typeof legacy.secretValue === 'string' && legacy.secretValue.trim()) {
          const enc = encryptSecretValue(legacy.secretValue.trim());
          migratedRecords.push({
            id: legacy.id || `sec_${crypto.randomUUID()}`,
            keyName: legacy.keyName || 'Secret',
            encryptedValue: enc.encryptedValue,
            iv: enc.iv,
            tag: enc.tag,
            length: enc.length,
            createdAt: legacy.createdAt || new Date().toISOString(),
          });
        }
      }

      // Persist migrated encrypted records and immediately purge legacy plaintext field
      if (migratedRecords.length > 0) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...metadata,
            encrypted_preserved_secrets: migratedRecords,
            preserved_secrets: null, // Purge legacy plaintext field from user_metadata
            secretsMigratedAt: new Date().toISOString(),
          },
        });
        if (!updateError) {
          console.info(`[secretsService] Successfully migrated ${migratedRecords.length} legacy secrets to encrypted-at-rest storage for user ${userId}`);
        }
      }

      return migratedRecords;
    }
  } catch (e) {
    console.warn(`[secretsService] Failed to load encrypted records for user ${userId}`);
  }
  return [];
}

/**
 * Retrieves the array of decrypted secret string values for a given userId.
 * INTERNAL USE ONLY: Strictly for server-side content masking (redaction).
 * NEVER return these raw strings over API responses.
 */
export async function getUserSecrets(userId: string): Promise<string[]> {
  try {
    const records = await loadUserEncryptedRecords(userId);
    const decryptedStrings: string[] = [];
    for (const r of records) {
      const plain = decryptSecretRecord(r);
      if (plain) {
        decryptedStrings.push(plain);
      }
    }
    return decryptedStrings;
  } catch {
    console.error(`[getUserSecrets] Internal decryption error for user ${userId}`);
    return [];
  }
}

/**
 * Retrieves the list of preserved secret metadata for a given userId.
 * NEVER includes secretValue or ciphertext.
 */
export async function getUserSecretsMetadata(userId: string): Promise<PreservedSecretMetadata[]> {
  const records = await loadUserEncryptedRecords(userId);
  return records.map(r => ({
    id: r.id,
    keyName: r.keyName,
    masked: '*'.repeat(r.length || 6),
    createdAt: r.createdAt,
  }));
}

/**
 * Backward-compatibility alias: returns metadata only.
 * NEVER returns raw secretValue.
 */
export async function getUserSecretsList(userId: string): Promise<PreservedSecretMetadata[]> {
  return getUserSecretsMetadata(userId);
}

/**
 * Saves or updates preserved secrets for a given userId.
 * Values are encrypted at rest with AES-256-GCM before persistence.
 * Returns metadata list only (no raw secret values).
 */
export async function saveUserSecrets(
  userId: string,
  inputs: SaveSecretInput[]
): Promise<PreservedSecretMetadata[]> {
  const supabase = getSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
  if (authError || !authData?.user) {
    throw new Error('User not found.');
  }

  const existingRecords = await loadUserEncryptedRecords(userId);
  const existingMap = new Map(existingRecords.map(r => [r.id, r]));

  const newEncryptedRecords: EncryptedSecretRecord[] = [];

  for (const input of inputs) {
    if (!input) continue;
    const existing = input.id ? existingMap.get(input.id) : null;

    if (input.secretValue && typeof input.secretValue === 'string' && input.secretValue.trim()) {
      // Encrypt new or updated secret value
      const enc = encryptSecretValue(input.secretValue.trim());
      newEncryptedRecords.push({
        id: input.id || `sec_${crypto.randomUUID()}`,
        keyName: input.keyName || (existing?.keyName || 'Secret'),
        encryptedValue: enc.encryptedValue,
        iv: enc.iv,
        tag: enc.tag,
        length: enc.length,
        createdAt: input.createdAt || (existing?.createdAt || new Date().toISOString()),
      });
    } else if (existing) {
      // Keep existing encrypted payload if only metadata changed
      newEncryptedRecords.push({
        ...existing,
        keyName: input.keyName || existing.keyName,
      });
    }
  }

  const existingMeta = authData.user.user_metadata || {};
  const updatedMeta = {
    ...existingMeta,
    encrypted_preserved_secrets: newEncryptedRecords,
    preserved_secrets: null, // Purge legacy plaintext field
    secretsUpdatedAt: new Date().toISOString(),
  };

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: updatedMeta,
  });

  if (updateError) {
    console.error(`[secretsService] Update error for user ${userId}: ${updateError.message}`);
    throw new Error('Failed to update preserved secrets.');
  }

  return newEncryptedRecords.map(r => ({
    id: r.id,
    keyName: r.keyName,
    masked: '*'.repeat(r.length || 6),
    createdAt: r.createdAt,
  }));
}

/**
 * Adds a single secret to the user's preserved secrets.
 * Encrypted at rest. Returns updated metadata list only.
 */
export async function addUserSecret(
  userId: string,
  input: { keyName?: string; secretValue: string }
): Promise<PreservedSecretMetadata[]> {
  if (!input.secretValue || typeof input.secretValue !== 'string' || !input.secretValue.trim()) {
    throw new Error('Valid secret value is required.');
  }

  const existing = await loadUserEncryptedRecords(userId);
  const enc = encryptSecretValue(input.secretValue.trim());
  const newRecord: EncryptedSecretRecord = {
    id: `sec_${crypto.randomUUID()}`,
    keyName: input.keyName || `Secret #${existing.length + 1}`,
    encryptedValue: enc.encryptedValue,
    iv: enc.iv,
    tag: enc.tag,
    length: enc.length,
    createdAt: new Date().toISOString(),
  };

  const updatedRecords = [newRecord, ...existing];

  const supabase = getSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
  if (authError || !authData?.user) {
    throw new Error('User not found.');
  }

  const existingMeta = authData.user.user_metadata || {};
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...existingMeta,
      encrypted_preserved_secrets: updatedRecords,
      preserved_secrets: null,
      secretsUpdatedAt: new Date().toISOString(),
    },
  });

  if (updateError) {
    console.error(`[secretsService] Add secret error for user ${userId}: ${updateError.message}`);
    throw new Error('Failed to save preserved secret.');
  }

  return updatedRecords.map(r => ({
    id: r.id,
    keyName: r.keyName,
    masked: '*'.repeat(r.length || 6),
    createdAt: r.createdAt,
  }));
}

/**
 * Deletes a preserved secret for a given userId.
 * Strictly verifies ownership before removing. Returns updated metadata list.
 */
export async function deleteUserSecret(
  userId: string,
  secretId: string
): Promise<PreservedSecretMetadata[]> {
  const existing = await loadUserEncryptedRecords(userId);
  const targetIndex = existing.findIndex(r => r.id === secretId);

  // Strict ownership enforcement
  if (targetIndex === -1) {
    const err: any = new Error('Secret not found or does not belong to the authenticated account.');
    err.status = 404;
    throw err;
  }

  const remaining = existing.filter(r => r.id !== secretId);

  const supabase = getSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
  if (authError || !authData?.user) {
    throw new Error('User not found.');
  }

  const existingMeta = authData.user.user_metadata || {};
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...existingMeta,
      encrypted_preserved_secrets: remaining,
      preserved_secrets: null,
      secretsUpdatedAt: new Date().toISOString(),
    },
  });

  if (updateError) {
    console.error(`[secretsService] Delete secret error for user ${userId}: ${updateError.message}`);
    throw new Error('Failed to delete preserved secret.');
  }

  return remaining.map(r => ({
    id: r.id,
    keyName: r.keyName,
    masked: '*'.repeat(r.length || 6),
    createdAt: r.createdAt,
  }));
}

/**
 * Automatically masks account-specific credentials for the posting account:
 * - Account password (checked against user.passwordHash)
 * - Agent API key (checked against user.apiKeyHash)
 * - Active Refresh tokens (checked against refresh_tokens table)
 * Any identified credential is immediately replaced with '******'.
 */
export async function maskAccountCredentials(userId: string, text: string): Promise<string> {
  if (!userId || !text || typeof text !== 'string') return text;

  let sanitized = text;

  try {
    const supabase = getSupabaseClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, agentId, passwordHash, apiKeyHash')
      .eq('id', userId)
      .maybeSingle();

    if (!user) return sanitized;

    // 1. Check account password against user.passwordHash
    if (user.passwordHash) {
      // Direct whole match
      try {
        if (bcrypt.compareSync(sanitized.trim(), user.passwordHash)) {
          return '******';
        }
      } catch {}

      // Extract candidate tokens from text (passwords in AAMARVA are 8-128 characters)
      const words = sanitized.split(/\s+/);
      const rawCandidates: string[] = [];
      for (const w of words) {
        const trimmedWord = w.trim();
        if (trimmedWord.length >= 8 && trimmedWord.length <= 128) {
          rawCandidates.push(trimmedWord);
        }
        // Also test stripping wrapping quotes, parentheses, trailing punctuation
        const stripped = trimmedWord.replace(/^["'`([{<]+|[>"'`)\],;:]+$/g, '');
        if (stripped.length >= 8 && stripped.length <= 128 && stripped !== trimmedWord) {
          rawCandidates.push(stripped);
        }
      }
      const candidates = [...new Set(rawCandidates)];
      candidates.sort((a, b) => b.length - a.length);

      for (const cand of candidates.slice(0, 15)) {
        try {
          if (bcrypt.compareSync(cand, user.passwordHash)) {
            const escaped = escapeRegExp(cand);
            sanitized = sanitized.replace(new RegExp(escaped, 'g'), '******');
          }
        } catch {}
      }
    }

    // 2. Check API key against user.apiKeyHash
    if (user.apiKeyHash) {
      const apiCandidates = [...new Set(sanitized.match(/[A-Za-z0-9_-]{20,80}/g) || [])];
      for (const cand of apiCandidates.slice(0, 8)) {
        try {
          if (bcrypt.compareSync(cand, user.apiKeyHash)) {
            const escaped = escapeRegExp(cand);
            sanitized = sanitized.replace(new RegExp(escaped, 'g'), '******');
          }
        } catch {}
      }
    }

    // 3. Check active refresh tokens for this user
    try {
      const { data: refreshTokens } = await supabase
        .from('refresh_tokens')
        .select('tokenHash')
        .eq('userId', userId)
        .eq('isRevoked', false)
        .limit(20);

      if (refreshTokens && refreshTokens.length > 0) {
        const hashSet = new Set(refreshTokens.map(r => r.tokenHash));
        const candidateTokens = sanitized.match(/[A-Za-z0-9._-]{20,256}/g) || [];
        for (const tok of candidateTokens) {
          const directHash = crypto.createHash('sha256').update(tok).digest('hex');
          const dotSecret = tok.includes('.') ? tok.split('.').slice(1).join('.') : null;
          const dotHash = dotSecret ? crypto.createHash('sha256').update(dotSecret).digest('hex') : null;
          if (hashSet.has(directHash) || (dotHash && hashSet.has(dotHash))) {
            const escaped = escapeRegExp(tok);
            sanitized = sanitized.replace(new RegExp(escaped, 'g'), '******');
          }
        }
      }
    } catch {}

  } catch (err) {
    console.error(`[maskAccountCredentials] Error checking credentials for user ${userId}:`, err);
  }

  return sanitized;
}

/**
 * Helper to scrub text using built-in credential protection, user preserved secrets, and account credentials.
 * Effective pipeline: Built-in credentials -> User preserved secrets -> Account credentials (password, API key, refresh tokens).
 * Immediately masks identified credentials with '******'.
 */
export async function maskUserSecretsInText(
  userId: string,
  text: string,
  contextCredentials?: string[]
): Promise<string> {
  if (!text || typeof text !== 'string') return text;

  // 1. Built-in AAMARVA credential protection (API keys, JWTs, request credentials) -> '******'
  let sanitized = maskBuiltInCredentials(text, contextCredentials);

  // 2. User-saved secrets from Secrets Preserver -> '******'
  const secrets = await getUserSecrets(userId);
  sanitized = maskSecretWords(sanitized, secrets);

  // 3. Account-specific credentials protection (Password, API key, Refresh tokens) -> '******'
  sanitized = await maskAccountCredentials(userId, sanitized);

  return sanitized;
}
