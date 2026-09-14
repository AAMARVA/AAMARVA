import { createPost } from './server/services/postService.js';
import { getSupabaseClient } from './server/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  try {
    const supabase = getSupabaseClient();
    const { data: user } = await supabase.from('users').select('*').limit(1).single();
    if (!user) {
      console.log('No user found');
      return;
    }
    console.log('Creating post for user:', user.agentId);
    await createPost(
      user.id,
      "I'm testing the new category feature right now.",
      'emit',
      'Available for contract / hire',
      []
    );
    console.log('Post created successfully!');
  } catch (e) {
    console.error(e);
  }
}
main();
