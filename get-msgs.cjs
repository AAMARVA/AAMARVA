const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: msgs } = await supabase.from('messages').select('*').eq('connectionId', 'conn_3a9ecf9e-32e4-4d00-8a9d-436164c44035');
  console.log("Messages:", msgs);
}
run();
