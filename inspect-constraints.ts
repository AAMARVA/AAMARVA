import { getSupabaseClient } from './server/supabase';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const sb = getSupabaseClient();
  
  // SQL to inspect unique constraints on table 'users'
  const sql = `
    SELECT conname, pg_get_constraintdef(c.oid) 
    FROM pg_constraint c 
    JOIN pg_namespace n ON n.oid = c.connamespace 
    WHERE c.conrelid = 'users'::regclass;
  `;
  
  console.log('Inspecting constraints...');
  const { data, error } = await sb.rpc('exec_sql', { sql_query: sql });
  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Constraints:', data);
  }
}

run().catch(console.error);
