/**
 * AAMARVA Secrets Preserver - Client Library
 * 
 * SECURITY BOUNDARY NOTICE:
 * Browser localStorage stores ONLY sanitized metadata (id, keyName, masked, createdAt).
 * Raw secret values are NEVER persisted to localStorage.
 * Browser storage is NOT a hardware cluster or zero-knowledge vault; real protection
 * relies on AES-256-GCM authenticated encryption at rest on the backend server.
 */

import { apiFetch } from '../services/authApi';

export interface PreservedSecretEntry {
  id: string;
  keyName: string;
  secretValue: string;
  masked?: string;
  createdAt: string;
}

export const STORAGE_KEY_DEFAULT = 'aamarva_secrets_preserver';

export function getStorageKey(agentId?: string): string {
  if (agentId && agentId.trim()) {
    return `aamarva_secrets_preserver_${agentId.replace(/^@/, '').toLowerCase()}`;
  }
  return STORAGE_KEY_DEFAULT;
}

/**
 * Escapes regex special characters in a string.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces all occurrences of any secret value with asterisks matching the content length or '******'.
 */
export function maskSecretWords(text: string, secretValues: string[]): string {
  if (!text || typeof text !== 'string') return text;
  if (!secretValues || secretValues.length === 0) return text;

  let sanitized = text;
  const validSecrets = secretValues
    .filter(s => typeof s === 'string' && s.trim().length > 0)
    .sort((a, b) => b.length - a.length);

  for (const sec of validSecrets) {
    const escaped = escapeRegExp(sec);
    const regex = new RegExp(escaped, 'g');
    sanitized = sanitized.replace(regex, '******');
  }

  return sanitized;
}

/**
 * Automatically masks AAMARVA API keys, JWT tokens, and request credentials with '******'.
 */
export function maskBuiltInCredentials(text: string, extraCredentials: string[] = []): string {
  if (!text || typeof text !== 'string') return text;

  let sanitized = text;

  // 1. Mask known AAMARVA API Key formats (sk_amr_..., amr_live_...)
  const apiKeyPattern = /\b(?:sk_amr_[0-9a-zA-Z_-]{20,80}|amr_live_[0-9a-zA-Z_-]{20,80})\b/g;
  sanitized = sanitized.replace(apiKeyPattern, '******');

  // 2. Mask JWT tokens (header.payload.signature)
  const jwtPattern = /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g;
  sanitized = sanitized.replace(jwtPattern, '******');

  // 3. Mask any additional credentials
  if (Array.isArray(extraCredentials) && extraCredentials.length > 0) {
    const validCreds = extraCredentials
      .filter(c => typeof c === 'string' && c.trim().length >= 6)
      .map(c => c.trim())
      .sort((a, b) => b.length - a.length);

    for (const cred of validCreds) {
      const escaped = escapeRegExp(cred);
      const regex = new RegExp(escaped, 'g');
      sanitized = sanitized.replace(regex, '******');
    }
  }

  return sanitized;
}

/**
 * Detects phone numbers deterministically across international and national formats.
 */
export function containsPhoneNumber(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  const intlWithPlus = /\+\s*\d(?:[-.\s()]*\d){6,14}\b/;
  if (intlWithPlus.test(text)) {
    return true;
  }

  const scrubbed = text
    .replace(/\b(?:\d{4}[-/.]\d{2}[-/.]\d{2}|\d{2}[-/.]\d{2}[-/.]\d{4})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/gi, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/\bv?\d+\.\d+(?:\.\d+)+\b/gi, ' ')
    .replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, ' ')
    .replace(/\b[a-zA-Z0-9_-]*[a-zA-Z][a-zA-Z0-9_-]*\b/g, ' ')
    .replace(/[$€£¥₹]\s*\d+(?:,\d{3})*(?:\.\d+)?/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*%/g, ' ');

  const zeroPrefixRegex = /\b0(?:[-.\s()]*\d){9,11}\b/;
  if (zeroPrefixRegex.test(scrubbed)) {
    return true;
  }

  const parenAreaRegex = /\(\s*\d{2,4}\s*\)[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/;
  if (parenAreaRegex.test(scrubbed)) {
    return true;
  }

  const fiveFiveRegex = /\b\d{5}[-.\s]\d{5}\b/;
  if (fiveFiveRegex.test(scrubbed)) {
    return true;
  }

  const standardDelimited = /\b\d{2,4}[-.\s]\d{3,4}[-.\s]\d{3,4}\b/;
  if (standardDelimited.test(scrubbed)) {
    return true;
  }

  const tenToTwelveDigits = /\b\d{10,12}\b/;
  if (tenToTwelveDigits.test(scrubbed)) {
    return true;
  }

  return false;
}

/**
 * Detects email addresses deterministically, including standard RFC formats and common obfuscation patterns.
 */
export function containsEmailAddress(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  const standardEmailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
  if (standardEmailRegex.test(text)) {
    return true;
  }

  const obfuscatedEmailRegex = /\b[A-Za-z0-9._%+-]+\s*(?:\[at\]|\(at\)|\{at\}|@|\bat\b)\s*[A-Za-z0-9.-]+\s*(?:\.|\s*\[dot\]\s*|\s*\(dot\)\s*|\s*\{dot\}\s*|\s+dot\s+)[A-Za-z]{2,}\b/i;
  if (obfuscatedEmailRegex.test(text)) {
    return true;
  }

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
 */
export function validateContentForContactInfo(text: string): void {
  if (containsPhoneNumber(text)) {
    throw new Error('Contact information detected: Phone numbers are not permitted in transmissions.');
  }

  if (containsEmailAddress(text)) {
    throw new Error('Contact information detected: Email addresses are not permitted in transmissions.');
  }
}

/**
 * Purges any legacy plaintext secrets from browser localStorage.
 * Ensures local storage contains only safe metadata (id, keyName, masked, createdAt).
 */
export function purgeLegacyPlaintextStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    // Remove stale un-namespaced fallback key so orphaned/demo secrets do not bleed across accounts
    localStorage.removeItem(STORAGE_KEY_DEFAULT);

    const keysToCheck: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('aamarva_secrets_preserver_')) {
        keysToCheck.push(key);
      }
    }

    for (const key of new Set(keysToCheck)) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const sanitized = parsed.map((item: any) => ({
              id: item.id,
              keyName: item.keyName,
              masked: item.masked || (typeof item.secretValue === 'string' ? '*'.repeat(item.secretValue.length) : '******'),
              createdAt: item.createdAt,
            }));
            localStorage.setItem(key, JSON.stringify(sanitized));
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
}

// Auto-purge legacy storage on load
if (typeof window !== 'undefined') {
  purgeLegacyPlaintextStorage();
}

/**
 * Retrieves secrets metadata stored locally for the given agentId.
 * Guaranteed to return masked representations without exposing raw secrets from disk.
 * Accounts that have not added any secrets will return an empty array without inheriting global defaults.
 */
export function getStoredSecrets(agentId?: string): PreservedSecretEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    let items: any[] = [];
    if (agentId && agentId.trim()) {
      const savedAgent = localStorage.getItem(getStorageKey(agentId));
      if (savedAgent) items = JSON.parse(savedAgent);
      // Strictly scoped to the authenticated agent: do NOT fallback to global storage
    } else {
      const saved = localStorage.getItem(STORAGE_KEY_DEFAULT);
      if (saved) items = JSON.parse(saved);
    }

    if (Array.isArray(items)) {
      return items.map((item: any) => ({
        id: item.id,
        keyName: item.keyName,
        secretValue: item.masked || '******',
        masked: item.masked || '******',
        createdAt: item.createdAt,
      }));
    }
  } catch (e) {
    console.warn('Error reading stored secrets metadata:', e);
  }
  return [];
}

/**
 * Saves secrets metadata locally.
 * Strips raw secrets and stores only metadata (id, keyName, masked, createdAt).
 */
export function saveStoredSecrets(secrets: PreservedSecretEntry[], agentId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const metadataOnly = secrets.map(s => ({
      id: s.id,
      keyName: s.keyName,
      masked: s.masked || '*'.repeat((s.secretValue && s.secretValue !== s.masked) ? s.secretValue.length : 12),
      createdAt: s.createdAt,
    }));
    const dataStr = JSON.stringify(metadataOnly);
    if (agentId && agentId.trim()) {
      localStorage.setItem(getStorageKey(agentId), dataStr);
    } else {
      localStorage.setItem(STORAGE_KEY_DEFAULT, dataStr);
    }
  } catch (e) {
    console.warn('Error saving stored secrets metadata:', e);
  }
}

/**
 * Redacts any preserved secret words, current account credentials, and built-in credentials from the input text before transmission or display.
 */
export function maskTextWithSecrets(text: string, agentId?: string, extraCredentials?: string[]): string {
  if (!text || typeof text !== 'string') return text;
  // 1. Built-in and request-context credentials masking
  let sanitized = maskBuiltInCredentials(text, extraCredentials);
  // 2. Preserved secrets masking
  const stored = getStoredSecrets(agentId);
  const values = stored.map(s => s.secretValue).filter(v => v && !v.startsWith('***'));
  return maskSecretWords(sanitized, values);
}

/**
 * Sanitizes locally decrypted E2EE messages prior to UI rendering, ensuring no contact information,
 * account credentials, or preserved secrets are exposed.
 */
export function sanitizeDecryptedMessage(text: string, agentId?: string, extraCredentials?: string[]): string {
  if (!text || typeof text !== 'string') return text;
  let sanitized = maskTextWithSecrets(text, agentId, extraCredentials);
  sanitized = maskContactInfo(sanitized);
  return sanitized;
}

/**
 * Synchronizes secrets with the backend server for authenticated users.
 * Server returns safe metadata only (id, keyName, masked, createdAt).
 */
export async function syncSecretsWithServer(agentId?: string): Promise<PreservedSecretEntry[]> {
  try {
    const res = await apiFetch('/api/secrets', { authType: 'human' });
    if (res?.success && Array.isArray(res.data)) {
      const merged: PreservedSecretEntry[] = res.data.map((item: any) => ({
        id: item.id,
        keyName: item.keyName,
        secretValue: item.masked || '******',
        masked: item.masked || '******',
        createdAt: item.createdAt,
      }));
      return merged;
    }
  } catch (e) {
    // Non-blocking fallback
  }
  return [];
}

/**
 * Saves secrets to the backend server via human authentication.
 */
export async function saveSecretsToServer(secrets: PreservedSecretEntry[]): Promise<boolean> {
  try {
    const res = await apiFetch('/api/secrets', {
      method: 'POST',
      body: JSON.stringify({ secrets }),
      authType: 'human',
    });
    return Boolean(res?.success);
  } catch (e) {
    console.warn('Could not sync secrets to server:', e);
    return false;
  }
}

/**
 * Deletes a preserved secret from the backend server via human authentication.
 */
export async function deleteSecretFromServer(secretId: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/secrets/${encodeURIComponent(secretId)}`, {
      method: 'DELETE',
      authType: 'human',
    });
    return Boolean(res?.success);
  } catch (e) {
    console.warn('Could not delete secret from server:', e);
    return false;
  }
}

