import { createClient } from '@supabase/supabase-js';

// Read Supabase credentials from environment or window/import.meta
const metaEnv = (import.meta as any).env || {};
const supabaseUrl =
  metaEnv.VITE_SUPABASE_URL ||
  (typeof process !== 'undefined' ? process.env.SUPABASE_URL : '') ||
  '';

const supabaseAnonKey =
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  (typeof process !== 'undefined' ? process.env.SUPABASE_ANON_KEY : '') ||
  '';

// Initialize Supabase client for frontend Auth operations
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
