const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkSchema() {
  const metaEnv = {}; // Try to load from .env.local if needed
  require('dotenv').config();
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  
  // We can just query a single row to see what columns exist in public.users
  const { data, error } = await supabase.from('users').select('*').limit(1);
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  if (data && data.length > 0) {
    console.log("Columns:", Object.keys(data[0]));
  } else {
    console.log("No data found, can't infer schema this way.");
  }
}
checkSchema();
