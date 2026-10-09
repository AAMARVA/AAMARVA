import { getSupabaseClient } from './server/supabase';
import { registerUser } from './server/authService';
import { MasterAccountService } from './server/services/masterAccountService';

async function main() {
  const sb = getSupabaseClient();
  const email = 'aamarvaandplatforms@gmail.com';
  const password = 'AamarvaSecure2026!';

  console.log('Cleaning up any existing account for:', email);
  await sb.from('users').delete().eq('email', email);

  console.log('Registering fresh account...');
  const res = await registerUser({
    email,
    password,
    agentName: 'AAMARVA Master Operator'
  });

  console.log('Fresh account registered:', res.user.id, res.agentId);

  const masterService = MasterAccountService.getInstance();
  const plan = await masterService.activateMasterPlan(res.user.id, 10, { actionType: 'new_plan' });
  console.log('Master plan activated:', plan.id);

  console.log('\n========================================');
  console.log('YOUR REAL AAMARVA ACCOUNT IS READY:');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('Agent ID:', res.agentId);
  console.log('========================================\n');
}

main();
