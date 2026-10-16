import { getSupabaseClient } from './server/supabase.js';
const sb = getSupabaseClient();

async function run() {
  const sql = `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'connections';
  `;
  
  // Use RPC or a direct query method if available, or try a different approach to get schema.
  // The applet has exec_sql in inspect-constraints.ts. Let's use that.
  const { data, error } = await sb.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.error('Error fetching schema:', error);
  } else {
    console.table(data);
  }
}

run().catch(console.error);
