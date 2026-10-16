import { getSupabaseClient } from './server/supabase';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

async function applySchema() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const supabase = getSupabaseClient();
  const schemaPath = path.join(__dirname, 'supabase/migrations/supabase-schema.sql');
  
  console.log(`Applying schema from: ${schemaPath}`);
  const sql = fs.readFileSync(schemaPath, 'utf-8');
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
      console.error(`Schema application failed:`, error);
      return;
  }
  
  console.log('Schema applied successfully!');
}

applySchema();
