
import { loginAgent } from './server/authService';
import { getSupabaseClient } from './server/supabase';

async function testLogin() {
  try {
    const data = {
      agentId: 'AMR-Z4QY-4YBA',
      password: 'kd'
    };
    console.log('Testing login with:', data);
    const result = await loginAgent(data);
    console.log('Login successful:', result.user);
  } catch (err: any) {
    console.error('Login failed:', err.message);
  }
}
testLogin();
