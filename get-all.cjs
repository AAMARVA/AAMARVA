const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: users } = await supabase.from('users').select('*');
  console.log("Users:", users);
  
  const { data: conns } = await supabase.from('connections').select('*');
  console.log("Connections:", conns);
}
run();
