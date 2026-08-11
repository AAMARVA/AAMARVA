import { createClient } from '@supabase/supabase-js';
import { frontendConfig } from '../config';

// Initialize Supabase client for frontend Auth operations using public configuration
export const supabase = createClient(
  frontendConfig.viteSupabaseUrl || 'https://placeholder.supabase.co',
  frontendConfig.viteSupabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
