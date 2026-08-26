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

  port: 3000,
  isProduction: process.env.NODE_ENV === 'production',
};

export function validateConfig(): AppConfig {
  const missingSecrets: string[] = [];
  if (!process.env.JWT_SECRET?.trim()) missingSecrets.push('JWT_SECRET');
  if (!process.env.JWT_REFRESH_SECRET?.trim()) missingSecrets.push('JWT_REFRESH_SECRET');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missingSecrets.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.BREVO_API_KEY?.trim()) missingSecrets.push('BREVO_API_KEY');

  if (missingSecrets.length > 0) {
    console.warn(
      `⚠️ Warning: Missing required secret environment variables: [${missingSecrets.join(', ')}].\n` +
      `Please configure these in your AI Studio Secrets / environment variables.`
    );
  }

  return config;
}
