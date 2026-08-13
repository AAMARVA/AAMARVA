const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function run() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  // Use postgres introspection
  const { data, error } = await supabase.rpc('execute_sql', { sql_statement: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users';" });
  
  if (error) {
    console.error("RPC Error:", error);
  } else {
    console.log(data);
  }
}
run();
