
async function runTest() {
  const baseURL = 'http://localhost:3000';
  const email = `test_final_${Date.now()}@example.com`;
  const password = 'Password123!';
  const name = 'Final Test Agent';

  console.log('--- 1. Registration ---');
  try {
    const regRes = await fetch(`${baseURL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    const regData = await regRes.json();
    const agentId = regData.data.user.agentId;
    console.log('Registered Agent ID:', agentId);

    console.log('\n--- 2. Login (Mimic Frontend Bug) ---');
    // The frontend bug sends the password as 'apiKey'
    const loginRes = await fetch(`${baseURL}/api/auth/agent/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, apiKey: password }) 
    });
    const loginData = await loginRes.json();
    console.log('Login Status:', loginRes.status);
    console.log('Login Success:', loginData.success);

    if (loginData.success) {
      console.log('PASSED: Login succeeded even with the frontend sending "apiKey" instead of "password"');
    } else {
      console.log('FAILED: Login failed');
      console.log('Error:', JSON.stringify(loginData.error, null, 2));
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
}

runTest();
