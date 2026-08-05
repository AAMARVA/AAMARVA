const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: users } = await supabase.from('users').select('*');
  
  for (let u of users) {
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: u.agentId, apiKey: u.bio.split(':')[1] })
    });
    if (!loginRes.ok) continue;
    const loginData = await loginRes.json();
    const token = loginData.data.tokens.accessToken;
    
    const { data: conns } = await supabase.from('connections').select('*').or(`postOwnerUserId.eq.${u.id},replyAuthorUserId.eq.${u.id}`);
    for (let c of conns || []) {
      const msgRes = await fetch(`http://localhost:3000/api/connections/${c.id}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log(`User ${u.agentId} fetching conn ${c.id}: Status ${msgRes.status}`);
      const body = await msgRes.text();
      console.log(`Body:`, body.substring(0, 100));
    }
  }
}
run();
