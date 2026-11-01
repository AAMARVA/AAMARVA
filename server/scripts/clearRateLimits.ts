import { getSupabaseClient } from '../supabase';

async function clearRateLimits() {
  console.log('Clearing rate limits...');
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('security_rate_limit_buckets').delete().neq('id', 'dummy');
  if (error) {
    console.error('Error clearing rate limits:', error.message);
  } else {
    console.log('Rate limits cleared successfully.');
  }
}

clearRateLimits();
