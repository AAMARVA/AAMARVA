import { getSupabaseClient } from './server/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const sb = getSupabaseClient();
  const res = await sb.from('posts').select('*');
  console.log('Posts:', res);
}
test().catch(console.error);
