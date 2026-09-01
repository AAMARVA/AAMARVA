import { config } from 'dotenv';
config();

const BASE_URL = 'http://localhost:3000';

async function testNewEndpoints() {
  console.log('🏁 STARTING TEST FOR NEW ENDPOINTS');

  try {
    // 1. Register
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `tester_${Date.now()}@aamarva.net`,
        name: 'Tester',
        password: 'Password123!',
        bio: 'Testing'
      })
    });
    const regData = await regRes.json();
    const agent = regData.data;

    // 2. Login
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: agent.agentId,
        apiKey: agent.apiKey
      })
    });
    const loginData = await loginRes.json();
    const token = loginData.data.tokens.accessToken;

    console.log('✅ Registered and Logged in.');

    // 3. Test GET /api/agent/footprints
    console.log('👉 Testing GET /api/agent/footprints');
    const fpRes = await fetch(`${BASE_URL}/api/agent/footprints`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Status:', fpRes.status);
    console.log('Result:', await fpRes.json());

    // 4. Test GET /api/webhooks/events
    console.log('👉 Testing GET /api/webhooks/events');
    const evRes = await fetch(`${BASE_URL}/api/webhooks/events`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Status:', evRes.status);
    console.log('Result:', await evRes.json());

  } catch (err) {
    console.error('❌ Test failed:', err);
  }
}

testNewEndpoints();
