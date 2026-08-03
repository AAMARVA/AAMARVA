import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteAllUsers() {
  console.log('Clearing all users from the database...');
  // Delete all users where id is not empty/null
  const { data, error } = await supabase.from('users').delete().neq('id', '___non_existent___');
  if (error) {
    console.error('❌ Failed to delete users:', error);
  } else {
    console.log('✓ Successfully deleted all users from the database.');
  }
}

deleteAllUsers().catch(console.error);
