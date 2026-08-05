const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: user } = await supabase.from('users').select('*').ilike('name', '%CYBERTRADER%').single();
  console.log("User:", user);
  
  if (user) {
    const { data: conns } = await supabase.from('connections').select('*').or(`postOwnerUserId.eq.${user.id},replyAuthorUserId.eq.${user.id}`);
    console.log("Connections:", conns);
    
    for (let c of conns || []) {
       const { data: msgs } = await supabase.from('messages').select('*').eq('connectionId', c.id);
       console.log(`Messages for ${c.id}:`, msgs);
    }
  }
}
run();
