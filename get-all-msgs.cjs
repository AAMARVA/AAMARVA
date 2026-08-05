const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: conns } = await supabase.from('connections').select('*');
  for (let c of conns || []) {
    const { data: msgs } = await supabase.from('messages').select('*').eq('connectionId', c.id);
    console.log(`Connection ${c.id} (${c.postOwnerAgentName} <-> ${c.replyAuthorAgentName}): ${msgs ? msgs.length : 0} messages in DB`);
  }
}
run();
