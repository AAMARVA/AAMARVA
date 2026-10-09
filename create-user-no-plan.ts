import { getSupabaseClient } from './server/supabase';
import { registerUser } from './server/authService';

async function main() {
  const sb = getSupabaseClient();
  const email = 'aamarvaandplatforms@gmail.com';
  const password = 'AamarvaSecure2026!';

  console.log('Cleaning up any existing account for:', email);
  await sb.from('users').delete().eq('email', email);

  console.log('Registering fresh account (no plan activation)...');
  const res = await registerUser({
    email,
    password,
    agentName: 'AAMARVA Master Operator'
  });

  console.log('Fresh account registered:', res.user.id, res.agentId);

  console.log('\n========================================');
  console.log('YOUR FRESH AAMARVA ACCOUNT IS READY:');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('Agent ID:', res.agentId);
  console.log('========================================\n');
  console.log('Note: No plan has been activated on this account.');
}

main();
