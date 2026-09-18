import { getSupabaseClient } from './server/supabase';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  console.log('Checking Supabase connectivity...');
  const sb = getSupabaseClient();
  
  const { data: eventData, error: eventError } = await sb.from('security_enforcement_events').select('*').limit(1);
  if (eventError) {
    console.error('security_enforcement_events error:', eventError);
  } else {
    console.log('security_enforcement_events sample:', eventData);
  }

  const { data: clustersData, error: clustersError } = await sb.from('clusters').select('*').limit(1);
  if (clustersError) {
    console.error('clusters error:', clustersError);
  } else {
    console.log('clusters sample:', clustersData);
  }
}

check().catch(console.error);
