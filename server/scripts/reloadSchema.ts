import { getSupabaseClient } from '../supabase';

async function reloadSchema() {
  console.log('Reloading Supabase schema cache...');
  const supabase = getSupabaseClient();
  
  // Method 1: Using RPC if it exists
  const { error: rpcError } = await supabase.rpc('exec_sql', { sql_query: "NOTIFY pgrst, 'reload schema';" });
  
  if (rpcError) {
    console.log('RPC exec_sql failed (maybe not defined):', rpcError.message);
  } else {
    console.log('Schema cache reloaded via RPC NOTIFY!');
  }
}

reloadSchema();
