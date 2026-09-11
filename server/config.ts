import dotenv from 'dotenv';

dotenv.config();

/**
 * Public / Non-Confidential Backend Configuration Defaults
 * Centralized in code. Can be overridden by environment variables if supplied.
 */
export const PUBLIC_CONFIG = {
  appUrl: process.env.APP_URL || 'https://aamarva.com',
  emailFrom: process.env.EMAIL_FROM || 'AAMARVA <no-reply@aamarva.com>',
  emailReplyTo: process.env.EMAIL_REPLY_TO || 'AAMARVA Support <support@aamarva.com>',
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
};

export interface AppConfig {
  jwtSecret: string | undefined;
  jwtRefreshSecret: string | undefined;
  supabaseUrl: string;
  supabaseServiceRoleKey: string | undefined;
  brevoApiKey: string | undefined;
  secretsEncryptionKey: string | undefined;
  apiKeyHmacSecret: string | undefined;
  corsAllowedOrigins: string;
  emailFrom: string;
  emailReplyTo: string;
  appUrl: string;
  port: number;
  isProduction: boolean;
}

export const config: AppConfig = {
  // Public non-confidential configuration
  appUrl: PUBLIC_CONFIG.appUrl,
  emailFrom: PUBLIC_CONFIG.emailFrom,
  emailReplyTo: PUBLIC_CONFIG.emailReplyTo,
  supabaseUrl: PUBLIC_CONFIG.supabaseUrl,

  // Sensitive environment secrets (read directly from process.env at runtime)
  get jwtSecret() { return process.env.JWT_SECRET; },
  get jwtRefreshSecret() { return process.env.JWT_REFRESH_SECRET; },
  get supabaseServiceRoleKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY; },
  get brevoApiKey() { return process.env.BREVO_API_KEY; },
  get secretsEncryptionKey() { return process.env.SECRETS_ENCRYPTION_KEY; },
  get apiKeyHmacSecret() { return process.env.API_KEY_HMAC_SECRET; },
  get corsAllowedOrigins() { return process.env.CORS_ALLOWED_ORIGINS || 'https://aamarva.com,https://www.aamarva.com'; },

  get port() { return 3000; },
  isProduction: process.env.NODE_ENV === 'production',
};

export function validateConfig(): AppConfig {
  const missingSecrets: string[] = [];
  const validationErrors: string[] = [];

  const supabaseUrl = process.env.SUPABASE_URL || PUBLIC_CONFIG.supabaseUrl;
  if (!supabaseUrl?.trim()) missingSecrets.push('SUPABASE_URL (or VITE_SUPABASE_URL)');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missingSecrets.push('SUPABASE_SERVICE_ROLE_KEY');
  const jwtSecret = process.env.JWT_SECRET?.trim();
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET?.trim();
  if (!jwtSecret) {
    missingSecrets.push('JWT_SECRET');
  } else if (jwtSecret.length < 32) {
    validationErrors.push('JWT_SECRET must be at least 32 characters long');
  }

  if (!jwtRefreshSecret) {
    missingSecrets.push('JWT_REFRESH_SECRET');
  } else if (jwtRefreshSecret.length < 32) {
    validationErrors.push('JWT_REFRESH_SECRET must be at least 32 characters long');
  }

  if (process.env.NODE_ENV === 'production' && jwtSecret && jwtRefreshSecret && jwtSecret === jwtRefreshSecret) {
    validationErrors.push('JWT_SECRET and JWT_REFRESH_SECRET must be strictly distinct in production');
  }

  const encKey = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  if (!encKey) {
    missingSecrets.push('SECRETS_ENCRYPTION_KEY');
  } else if (encKey.length < 32 && !/^[0-9a-fA-F]{64}$/.test(encKey)) {
    validationErrors.push('SECRETS_ENCRYPTION_KEY must be a 64-hex string (32 bytes) or passphrase of at least 32 characters');
  }

  const hmacSecret = process.env.API_KEY_HMAC_SECRET?.trim();
  if (process.env.NODE_ENV === 'production' && !hmacSecret) {
    missingSecrets.push('API_KEY_HMAC_SECRET');
  }

  if (missingSecrets.length > 0) {
    const errorMsg = `[Configuration Error] Missing required environment variables: [${missingSecrets.join(', ')}].`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(errorMsg);
    } else {
      console.warn(`⚠️ Warning: ${errorMsg}`);
    }
  }

  if (validationErrors.length > 0) {
    const errorMsg = `[Configuration Error] Invalid environment variables: [${validationErrors.join(', ')}].`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(errorMsg);
    } else {
      console.error(`❌ Error: ${errorMsg}`);
      console.warn('⚠️ Warning: Proceeding with potentially insecure configuration for development.');
    }
  }

  return config;
}
