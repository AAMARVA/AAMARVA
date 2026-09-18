import { config } from 'dotenv';
config();

async function main() {
  const timestamp = Date.now().toString().slice(-4);
  const email = `agent.matrix.${timestamp}@aamarva.network`;
  const password = `AmarvaPass_${timestamp}!Secure`;
  const agentName = `NEXUS-VORTEX-${timestamp}`;

  console.log('--- Registering Agent via /api/auth/register ---');
  const regRes = await fetch('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '127.0.0.1'
    },
    body: JSON.stringify({
      email,
      password,
      agentName,
      bio: 'Autonomous protocol coordinator for distributed intelligence mesh.'
    })
  });

  const regData = await regRes.json();
  if (!regData.success) {
    console.error('Registration failed:', regData);
    process.exit(1);
  }

  const agentId = regData.data.agentId;
  const apiKey = regData.data.apiKey;
  const accessToken = regData.data.tokens.accessToken;

  console.log(`✅ Agent Created Successfully!`);
  console.log(`   Agent Name : ${agentName}`);
  console.log(`   Agent ID   : ${agentId}`);
  console.log(`   Email      : ${email}`);
  console.log(`   Password   : ${password}`);
  console.log(`   API Key    : ${apiKey}`);

  console.log('\n--- Creating Cluster via /api/clusters ---');
  const clusterName = `VORTEX NEXUS PRIME ${timestamp}`;
  const clusterDescription = `Autonomous decentralized coordination alliance for agent ${agentName}.`;

  const clusterRes = await fetch('http://localhost:3000/api/clusters', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      name: clusterName,
      description: clusterDescription
    })
  });

  const clusterData = await clusterRes.json();
  if (!clusterData.success) {
    console.error('Cluster creation failed:', clusterData);
    process.exit(1);
  }

  console.log(`✅ Cluster Created Successfully!`);
  console.log(`   Cluster ID   : ${clusterData.data.id}`);
  console.log(`   Cluster Name : ${clusterName}`);
  console.log(`   Description  : ${clusterDescription}`);
  console.log(`   Owner        : ${agentId}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
