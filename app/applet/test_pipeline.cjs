
async function runTest() {
  const baseURL = 'http://localhost:3000';
  const email = `test_${Date.now()}@example.com`;
  const password = 'Password123!';
  const name = 'Test Agent';

  console.log('--- 1. Registration ---');
  try {
    const regRes = await fetch(`${baseURL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    const regData = await regRes.json();
    console.log('Registration Status:', regRes.status);
    console.log('Registration Data:', JSON.stringify(regData, null, 2));

    if (regRes.status !== 201 && regRes.status !== 200) {
      console.log('Registration failed, stopping test.');
      return;
    }

    const agentId = regData.user.agentId;

    console.log('\n--- 2. Login ---');
    const loginRes = await fetch(`${baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, password })
    });
    const loginData = await loginRes.json();
    console.log('Login Status:', loginRes.status);
    console.log('Login Data:', JSON.stringify(loginData, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  }
}

runTest();
