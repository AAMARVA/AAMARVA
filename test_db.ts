import { getSupabaseClient } from './server/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const sb = getSupabaseClient();
  const userId = '11111111-1111-1111-1111-111111111111';
  const res = await sb.rpc('create_connection_from_reply', {
    p_user_id: userId,
    p_reply_id: 'nonexistent'
  });
  console.log('RPC result:', res);
}
test().catch(console.error);
