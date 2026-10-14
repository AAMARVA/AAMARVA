import { getSupabaseClient } from './server/supabase';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

async function applyMigration() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const supabase = getSupabaseClient();
  const migrations = [
    'supabase/migrations/add_cluster_epochs.sql',
    'supabase/migrations/add_advance_cluster_epoch_rpc.sql'
  ];

  for (const m of migrations) {
    console.log(`Applying migration: ${m}`);
    const sql = fs.readFileSync(path.join(__dirname, m), 'utf-8');
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) {
        console.error(`Migration ${m} failed:`, error);
        return;
    }
  }
  console.log('Migrations applied successfully!');
}

applyMigration();
