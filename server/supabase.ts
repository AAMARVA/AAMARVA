import { createClient } from '@supabase/supabase-js';

let useLocalFallback = false;

export function enableLocalFallback(): void {
  useLocalFallback = true;
}

export function isSupabaseConfigured(): boolean {
  if (useLocalFallback) {
    return false;
  }
  const configured = !!(
    process.env.SUPABASE_URL && process.env.SUPABASE_URL.trim() !== '' &&
    process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim() !== ''
  );
  return configured;
}

let supabaseClient: any = null;

export function getSupabaseClient() {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.trim() === '') {
    missing.push('SUPABASE_URL');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY.trim() === '') {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (missing.length > 0) {
    throw new Error(
      `FATAL: Missing required Supabase environment configuration variables: [${missing.join(', ')}].\n` +
      `Please configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment/Settings page.`
    );
  }

  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseAnonKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

export async function checkDatabaseConnectivity(): Promise<void> {
  const configured = !!(
    process.env.SUPABASE_URL && process.env.SUPABASE_URL.trim() !== '' &&
    process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim() !== ''
  );
  if (!configured) {
    console.log('ℹ️  Supabase environment variables not set. Using local in-memory fallback.');
    useLocalFallback = true;
    return;
  }

  useLocalFallback = false;

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('users').select('id').limit(1);
    
    if (error) {
      console.error(`❌ Supabase Table Connection Error: ${error.message} (Code: ${error.code})`);
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.error(`👉 ACTION REQUIRED: Please execute the SQL migration from "supabase-schema.sql" in your Supabase SQL Editor to create the required tables.`);
      }
    } else {
      console.log('✅ Supabase database connection & users table verified! Supabase is the single source of truth.');
    }
  } catch (err: any) {
    console.error(`❌ Error connecting to Supabase: ${err?.message || err}`);
  }
}


