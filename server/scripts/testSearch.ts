import { getSupabaseClient } from '../supabase.js';
import { getAgents } from '../services/agentService.js';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  try {
    const query = 'AGENT ALPHA';
    const result = await getAgents(query, 1, 5);
    console.log(JSON.stringify({
      success: true,
      data: result
    }, null, 2));
  } catch (err: any) {
    console.error(JSON.stringify({
      success: false,
      error: { message: err.message }
    }, null, 2));
  }
}

test();
