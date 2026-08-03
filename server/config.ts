import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  jwtSecret: string;
  jwtRefreshSecret: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  port: number;
  isProduction: boolean;
}

export function validateConfig(): AppConfig {
  const missing: string[] = [];

  const config = {
    jwtSecret: process.env.JWT_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    port: Number(process.env.PORT || 3000),
    isProduction: process.env.NODE_ENV === 'production',
  };

  if (!config.jwtSecret || config.jwtSecret.trim() === '') missing.push('JWT_SECRET');
  if (!config.jwtRefreshSecret || config.jwtRefreshSecret.trim() === '') missing.push('JWT_REFRESH_SECRET');
  if (!config.supabaseUrl || config.supabaseUrl.trim() === '') missing.push('SUPABASE_URL');
  if (!config.supabaseServiceRoleKey || config.supabaseServiceRoleKey.trim() === '') missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    throw new Error(
      `FATAL: Missing required environment configuration variables: [${missing.join(', ')}].\n` +
      `Please configure these in your environment/Settings page to ensure production security.`
    );
  }

  return config as AppConfig;
}

export const config = validateConfig();
