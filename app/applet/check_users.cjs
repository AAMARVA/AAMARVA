
const { getSupabaseClient } = require('./server/supabase.js');

async function checkUser() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('agentId, passwordHash, apiKey')
    .limit(5);

  if (error) {
    console.error('Error fetching user:', error);
  } else {
    console.log('Users found:', JSON.stringify(data, null, 2));
  }
}

checkUser();
