const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function checkSchema() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase.from('users').select('*').limit(1);
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  if (data && data.length > 0) {
    console.log("Columns:", Object.keys(data[0]));
  } else {
    // Try to get column definitions via Postgres function if possible, or just insert a dummy and delete it
    console.log("No rows. Trying another way.");
  }
}
checkSchema();
