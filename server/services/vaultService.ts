import { getSupabaseClient } from '../supabase';
import crypto from 'crypto';

// This secret must be set in the environment variables
const VAULT_MASTER_SECRET = process.env.VAULT_MASTER_SECRET;

function validateSecret() {
  if (!VAULT_MASTER_SECRET || VAULT_MASTER_SECRET.length !== 64) {
    throw new Error('VAULT_MASTER_SECRET must be a 64-character hex string');
  }
}

export async function getVaultKey(userId: string) {
  validateSecret();

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('user_key_vaults')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Vault record not found');
  }

  // Decrypt the private key
  const [iv, encryptedContent] = data.encrypted_private_key.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(VAULT_MASTER_SECRET!, 'hex'), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(data.auth_tag, 'hex'));
  let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return {
    privateKey: decrypted,
    publicKey: data.public_key
  };
}

export async function saveVaultKey(userId: string, publicKey: string, privateKey: string) {
  validateSecret();

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(VAULT_MASTER_SECRET!, 'hex'), iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('user_key_vaults')
    .upsert({
      user_id: userId,
      public_key: publicKey,
      encrypted_private_key: `${iv.toString('hex')}:${encrypted}`,
      auth_tag: authTag.toString('hex')
    });

  if (error) {
    throw new Error(`Failed to save vault record: ${error.message}`);
  }
}
