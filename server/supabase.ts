import { createClient } from '@supabase/supabase-js';
import { PUBLIC_CONFIG } from './config';

export function isSupabaseConfigured(): boolean {
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
    throw new Error('DATABASE_NOT_CONFIGURED');
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
    console.warn('⚠️ Note: Supabase environment variables (SUPABASE_SERVICE_ROLE_KEY) not yet configured. Local fallback or pending configuration.');
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('users').select('id').limit(1);
    
    if (error) {
      console.warn(`⚠️ Supabase Table Connection Notice: ${error.message} (Code: ${error.code})`);
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn(`👉 ACTION REQUIRED: Please execute the SQL migration from "supabase-schema.sql" in your Supabase SQL Editor to create the required tables.`);
      }
    } else {
      console.log('✅ Supabase database connection & users table verified! Supabase is the single source of truth.');
    }
  } catch (err: any) {
    console.warn(`⚠️ Warning connecting to Supabase: ${err?.message || err}`);
  }
}
