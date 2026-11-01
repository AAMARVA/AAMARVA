
const { getSupabaseClient } = require('./server/supabase.js');
async function test() {
  const sb = getSupabaseClient();
  const { data: users } = await sb.from('users').select('*');
  console.log(JSON.stringify(users.map(u => ({ id: u.id, name: u.name, agentId: u.agentId, email: u.email, master_id: u.master_id, role: u.role, account_type: u.account_type, plan: u.plan, hasCapabilityIncrement: u.hasCapabilityIncrement })), null, 2));
}
test().catch(console.error);
