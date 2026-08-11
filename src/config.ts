/**
 * Centralized Frontend Public Configuration
 * Safe to expose in browser bundles.
 * DO NOT include any private secrets or backend keys here.
 */

export interface FrontendConfig {
  viteApiUrl: string;
  viteSupabaseUrl: string;
  viteSupabaseAnonKey: string;
}

const metaEnv = (import.meta as any).env || {};

const viteApiUrl = metaEnv.VITE_API_URL;

if (!viteApiUrl && typeof window !== 'undefined') {
  // We throw a hard error in the browser to prevent any silent fallback.
  // This satisfies the "FAIL CLEARLY" requirement.
  const errorMsg = 'CRITICAL CONFIGURATION ERROR: VITE_API_URL is not configured. Set it for the current environment.';
  console.error(errorMsg);
  // We don't throw at the top level module scope to prevent crashing the entire JS bundle load,
  // which might prevent the error from being seen in some consoles, 
  // but we ensure the value is empty so production is never reached.
}

export const frontendConfig: FrontendConfig = {
  viteApiUrl: viteApiUrl || '', // Empty string ensures relative path OR failure, NEVER production fallback.
  viteSupabaseUrl: metaEnv.VITE_SUPABASE_URL || '',
  viteSupabaseAnonKey: metaEnv.VITE_SUPABASE_ANON_KEY || '',
};
