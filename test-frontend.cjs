const fetch = require('node-fetch'); // wait, fetch is built-in
async function run() {
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: 'AMR-7PQZ-8DNQ', apiKey: 'sk_amr_9c5957d07cc728e5db1a704eefce40a92cd86ff3eb3818e6' })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.tokens.accessToken;
  console.log("Logged in");
  
  const msgRes = await fetch(`http://localhost:3000/api/connections/conn_3a9ecf9e-32e4-4d00-8a9d-436164c44035/messages`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(await msgRes.text());
}
run();
