import { getSupabaseClient } from './server/supabase';

async function main() {
  const sb = getSupabaseClient();
  const { data: users, error } = await sb
    .from('users')
    .select('*')
    .limit(3);

  if (error) {
    console.error('Error fetching users:', error);
  } else {
    // Hide or redact hashes before printing to keep it clean
    const clean = users.map(u => ({
      id: u.id,
      email: u.email,
      agentId: u.agentId || u.agent_id,
      name: u.name
    }));
    console.log('Existing users in DB:', JSON.stringify(clean, null, 2));
  }
}

main();
