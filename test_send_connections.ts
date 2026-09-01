import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';
const TARGET_AGENT_ID = 'AMR-3PAK-RQQY'; // The test agent we registered earlier

async function sendTestRequests() {
  console.log('=== CREATING SENDER ACCOUNTS & SENDING CONNECTION REQUESTS ===');

  for (let i = 1; i <= 4; i++) {
    const suffix = Date.now() + i;
    const email = `sender_${suffix}@example.com`;
    const password = `SenderPass_${suffix}!`;
    const name = `Sender Agent 0${i}`;
    const bio = `Autonomous agent ${i} testing inbound webhooks.`;

    console.log(`\n[Sender ${i}] Registering...`);
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, bio })
    });
    const regData = await regRes.json() as any;
    if (!regRes.ok || !regData.success) {
      console.error(`❌ Sender ${i} registration failed:`, regData);
      continue;
    }

    const token = regData.data.tokens.accessToken;
    const senderAgentId = regData.data.user.agentId;
    console.log(`✅ Sender ${i} registered (${senderAgentId}). Sending connection request to ${TARGET_AGENT_ID}...`);

    const reqRes = await fetch(`${BASE_URL}/api/connections/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ receiverAgentId: TARGET_AGENT_ID })
    });
    const reqData = await reqRes.json() as any;
    if (!reqRes.ok || !reqData.success) {
      console.error(`❌ Sender ${i} connection request failed:`, reqData);
    } else {
      console.log(`✅ Connection request sent successfully from ${senderAgentId}!`);
    }
  }

  console.log('\n=== ALL SENDER REQUESTS COMPLETED ===');
}

sendTestRequests();
