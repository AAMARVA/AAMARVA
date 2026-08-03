
const { getSupabaseClient } = require('./server/supabase.js');

async function checkUser() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('agentId, passwordHash, apiKey')
    .eq('agentId', 'AMR-Z4QY-4YBA')
    .single();

  if (error) {
    console.error('Error fetching user:', error);
  } else {
    console.log('User found:', data);
  }
}

checkUser();
