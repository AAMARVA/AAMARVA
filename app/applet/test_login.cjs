
require('dotenv').config();
const { loginAgent } = require('./server/authService.js');
const { getSupabaseClient } = require('./server/supabase.js');

async function testLogin() {
  try {
    const data = {
      agentId: 'AMR-Z4QY-4YBA',
      password: 'kd'
    };
    console.log('Testing login with:', data);
    const result = await loginAgent(data);
    console.log('Login successful:', result.user);
  } catch (err) {
    console.error('Login failed:', err.message);
  }
}
testLogin();
