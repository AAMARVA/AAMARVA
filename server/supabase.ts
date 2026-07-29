import { createClient } from '@supabase/supabase-js';

export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.SUPABASE_URL && process.env.SUPABASE_URL.trim() !== '' &&
    process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_ANON_KEY.trim() !== ''
  );
}

export function validateSupabaseEnvironment(): void {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.trim() === '') {
    missing.push('SUPABASE_URL');
  }
  if (!process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY.trim() === '') {
    missing.push('SUPABASE_ANON_KEY');
  }

  if (missing.length > 0) {
    console.warn(
      `⚠️ WARNING: Missing required Supabase environment configuration variables: [${missing.join(', ')}].\n` +
      `The server is starting, but database operations will use an in-memory fallback until these are configured.`
    );
  }
}

let supabaseClient: any = null;

export function getSupabaseClient() {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.trim() === '') {
    missing.push('SUPABASE_URL');
  }
  if (!process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY.trim() === '') {
    missing.push('SUPABASE_ANON_KEY');
  }

  if (missing.length > 0) {
    throw new Error(
      `FATAL: Missing required Supabase environment configuration variables: [${missing.join(', ')}].\n` +
      `Please configure SUPABASE_URL and SUPABASE_ANON_KEY in your environment/Settings page.`
    );
  }

  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

