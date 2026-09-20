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
    patchPostgrestBuilder(supabaseClient);
  }
  return supabaseClient;
}

function patchPostgrestBuilder(client: any) {
  if (!client) return;

  // 1. Prototype patching on PostgrestBuilder
  try {
    const probe = client.from('__proto_probe__').select('id');
    let proto = Object.getPrototypeOf(probe);
    while (proto && proto !== Object.prototype) {
      if (proto.constructor && (proto.constructor.name === 'PostgrestBuilder' || proto.constructor.name === 'PostgrestFilterBuilder')) {
        if (typeof proto.catch !== 'function') {
          proto.catch = function(onRejected: any) {
            return this.then(undefined, onRejected);
          };
        }
        if (typeof proto.finally !== 'function') {
          proto.finally = function(onFinally: any) {
            return this.then(
              (val: any) => Promise.resolve(onFinally && onFinally()).then(() => val),
              (err: any) => Promise.resolve(onFinally && onFinally()).then(() => { throw err; })
            );
          };
        }
      }
      proto = Object.getPrototypeOf(proto);
    }
  } catch (e) {}

  // 2. Wrap client.from methods to ensure any returned builder has .catch and .finally
  try {
    if (!client.__isCatchPatched) {
      client.__isCatchPatched = true;
      const originalFrom = client.from.bind(client);
      client.from = function(table: string, options?: any) {
        const builder = originalFrom(table, options);
        ['insert', 'update', 'delete', 'select', 'upsert'].forEach((method) => {
          const originalMethod = builder[method]?.bind(builder);
          if (typeof originalMethod === 'function') {
            builder[method] = function(...args: any[]) {
              const queryResult = originalMethod(...args);
              if (queryResult && typeof queryResult.then === 'function') {
                if (typeof queryResult.catch !== 'function') {
                  queryResult.catch = function(onRejected: any) {
                    return this.then(undefined, onRejected);
                  };
                }
                if (typeof queryResult.finally !== 'function') {
                  queryResult.finally = function(onFinally: any) {
                    return this.then(
                      (val: any) => Promise.resolve(onFinally && onFinally()).then(() => val),
                      (err: any) => Promise.resolve(onFinally && onFinally()).then(() => { throw err; })
                    );
                  };
                }
              }
              return queryResult;
            };
          }
        });
        return builder;
      };
    }
  } catch (e) {}
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

    // Check clusters table
    const { error: clusterError } = await supabase.from('clusters').select('id').limit(1);
    if (clusterError && (clusterError.code === '42P01' || clusterError.message?.includes('does not exist'))) {
      console.warn(`👉 ACTION REQUIRED: Please execute the SQL migration from "supabase/migrations/add_clusters_tables.sql" in your Supabase SQL Editor to enable Clusters.`);
    }

    // Check external_events table & details column
    const { error: eventError } = await supabase.from('external_events').select('id, details').limit(1);
    if (eventError && eventError.message?.includes('details does not exist')) {
      console.warn(`👉 SCHEMA NOTICE: Column "details" is missing on "external_events". Run "supabase/migrations/update_schema_external_events_and_passkeys.sql" in Supabase SQL Editor.`);
    }

    // Check webauthn_credentials table
    const { error: webauthnError } = await supabase.from('webauthn_credentials').select('id').limit(1);
    if (webauthnError && (webauthnError.code === '42P01' || webauthnError.message?.includes('does not exist'))) {
      console.warn(`👉 SCHEMA NOTICE: WebAuthn tables not found. If using Passkeys/WebAuthn hardware tokens, run "supabase/migrations/update_schema_external_events_and_passkeys.sql" in Supabase SQL Editor.`);
    }
  } catch (err: any) {
    console.warn(`⚠️ Warning connecting to Supabase: ${err?.message || err}`);
  }
}
