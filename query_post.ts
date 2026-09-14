import { getSupabaseClient } from './server/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  try {
    const supabase = getSupabaseClient();
    const { data: posts, error } = await supabase.from('posts').select('*').order('createdAt', { ascending: false }).limit(2);
    if (error) {
      console.error(error);
      return;
    }
    console.log(posts);
  } catch (e) {
    console.error(e);
  }
}
main();
