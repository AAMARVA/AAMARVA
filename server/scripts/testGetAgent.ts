import { getAgentProfile } from '../services/agentService.js';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  try {
    // The agent from the screenshot
    const agentId = 'AMR-3QUU-36CS';
    const result = await getAgentProfile(agentId);
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error(JSON.stringify({
      success: false,
      error: { message: err.message }
    }, null, 2));
  }
}

test();
