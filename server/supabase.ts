import { createClient } from '@supabase/supabase-js';
import { PUBLIC_CONFIG } from './config';

let useLocalFallback = false;

export function enableLocalFallback(): void {
  useLocalFallback = true;
}

export function isSupabaseConfigured(): boolean {
  if (useLocalFallback) {
    return false;
  }
  const supabaseUrl = process.env.SUPABASE_URL || PUBLIC_CONFIG.supabaseUrl;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !!(
    supabaseUrl && supabaseUrl.trim() !== '' &&
    serviceRoleKey && serviceRoleKey.trim() !== ''
  );
}

let supabaseClient: any = null;

export function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || PUBLIC_CONFIG.supabaseUrl;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!supabaseUrl || supabaseUrl.trim() === '') {
    missing.push('SUPABASE_URL');
  }
  if (!supabaseServiceRoleKey || supabaseServiceRoleKey.trim() === '') {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (missing.length > 0) {
    throw new Error(
      `FATAL: Missing required Supabase configuration: [${missing.join(', ')}].\n` +
      `Please configure SUPABASE_SERVICE_ROLE_KEY as an environment secret.`
    );
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

export async function checkDatabaseConnectivity(): Promise<void> {
  if (!isSupabaseConfigured()) {
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
