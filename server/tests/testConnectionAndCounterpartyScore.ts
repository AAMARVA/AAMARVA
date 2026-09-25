import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:3000/api';

async function runTests() {
  console.log('=== STARTING REGISTRATION, CONNECTION & COUNTERPARTY SCORE TEST SUITE ===\n');
  const timestamp = Date.now();
  const testResults: { name: string; success: boolean; details?: string }[] = [];

  const recordResult = (name: string, success: boolean, details?: string) => {
    testResults.push({ name, success, details });
    if (success) {
      console.log(`✅ [PASS] ${name}${details ? ` -> ${details}` : ''}`);
    } else {
      console.error(`❌ [FAIL] ${name}${details ? ` -> ${details}` : ''}`);
    }
  };

  try {
    // -------------------------------------------------------------
    // Step 1: Register Agent Alpha
    // -------------------------------------------------------------
    const alphaEmail = `agent_alpha_${timestamp}@testdomain.org`;
    const alphaPassword = 'AlphaSecurePassword123!';
    const alphaName = `Alpha_Node_${timestamp.toString().slice(-4)}`;

    console.log(`1. Registering Agent Alpha (${alphaEmail})...`);
    const regAlphaRes = await axios.post(`${BASE_URL}/auth/register`, {
      email: alphaEmail,
      password: alphaPassword,
      agentName: alphaName,
      bio: 'Primary alpha test agent node'
    });

    const alphaData = regAlphaRes.data?.data || regAlphaRes.data;
    const alphaAgentId = alphaData.agentId || alphaData.user?.agentId;
    const alphaApiKey = alphaData.apiKey;
    const alphaToken = alphaData.tokens?.accessToken;

    if (!alphaAgentId || !alphaApiKey) {
      throw new Error(`Failed to obtain Agent Alpha credentials. Response: ${JSON.stringify(regAlphaRes.data)}`);
    }
    recordResult('Register Agent Alpha', true, `agentId=${alphaAgentId}`);

    // -------------------------------------------------------------
    // Step 2: Register Agent Beta
    // -------------------------------------------------------------
    const betaEmail = `agent_beta_${timestamp}@testdomain.org`;
    const betaPassword = 'BetaSecurePassword123!';
    const betaName = `Beta_Node_${timestamp.toString().slice(-4)}`;

    console.log(`\n2. Registering Agent Beta (${betaEmail})...`);
    const regBetaRes = await axios.post(`${BASE_URL}/auth/register`, {
      email: betaEmail,
      password: betaPassword,
      agentName: betaName,
      bio: 'Secondary beta test agent node'
    });

    const betaData = regBetaRes.data?.data || regBetaRes.data;
    const betaAgentId = betaData.agentId || betaData.user?.agentId;
    const betaApiKey = betaData.apiKey;
    const betaToken = betaData.tokens?.accessToken;

    if (!betaAgentId || !betaApiKey) {
      throw new Error(`Failed to obtain Agent Beta credentials. Response: ${JSON.stringify(regBetaRes.data)}`);
    }
    recordResult('Register Agent Beta', true, `agentId=${betaAgentId}`);

    // -------------------------------------------------------------
    // Step 3: Agent Alpha sends Connection Request to Agent Beta
    // -------------------------------------------------------------
    console.log(`\n3. Agent Alpha requesting connection with Agent Beta (@${betaAgentId})...`);
    const connReqRes = await axios.post(
      `${BASE_URL}/connections/requests`,
      {
        receiverAgentId: betaAgentId,
        message: 'Establishing secure protocol connection'
      },
      {
        headers: {
          'X-API-KEY': alphaApiKey
        }
      }
    );

    const requestId = connReqRes.data?.data?.id || connReqRes.data?.id;
    if (!requestId) {
      throw new Error(`Failed to create connection request. Response: ${JSON.stringify(connReqRes.data)}`);
    }
    recordResult('Create Connection Request', true, `requestId=${requestId}`);

    // -------------------------------------------------------------
    // Step 4: Agent Beta accepts Connection Request
    // -------------------------------------------------------------
    console.log(`\n4. Agent Beta accepting connection request ${requestId}...`);
    const acceptRes = await axios.post(
      `${BASE_URL}/connections/requests/${requestId}/accept`,
      {},
      {
        headers: {
          'X-API-KEY': betaApiKey
        }
      }
    );

    const connectionData = acceptRes.data?.data || acceptRes.data;
    const connectionId = connectionData.id || connectionData.connectionId;
    if (!connectionId) {
      throw new Error(`Failed to accept connection request. Response: ${JSON.stringify(acceptRes.data)}`);
    }
    recordResult('Accept Connection Request', true, `connectionId=${connectionId}`);

    // -------------------------------------------------------------
    // Step 5: Agent Alpha submits Counterparty Score for Beta
    // -------------------------------------------------------------
    console.log(`\n5. Agent Alpha submitting Counterparty Score for Agent Beta on connection ${connectionId}...`);
    const alphaReviewComment = 'Reliable latency and high transaction integrity across all test vectors.';
    const alphaScoreRes = await axios.post(
      `${BASE_URL}/counter-party-score`,
      {
        connectionId: connectionId,
        comment: alphaReviewComment,
        reviewerAgentId: alphaAgentId
      },
      {
        headers: {
          'X-API-KEY': alphaApiKey
        }
      }
    );

    const alphaReview = alphaScoreRes.data?.review || alphaScoreRes.data?.data;
    if (!alphaScoreRes.data?.success || !alphaReview?.id) {
      throw new Error(`Failed to submit counterparty score. Response: ${JSON.stringify(alphaScoreRes.data)}`);
    }
    recordResult('Submit Counterparty Score (Alpha -> Beta)', true, `reviewId=${alphaReview.id}`);

    // -------------------------------------------------------------
    // Step 6: Agent Beta submits Counterparty Score for Alpha
    // -------------------------------------------------------------
    console.log(`\n6. Agent Beta submitting Counterparty Score for Agent Alpha on connection ${connectionId}...`);
    const betaReviewComment = 'Prompt handshake execution and robust packet parsing verified.';
    const betaScoreRes = await axios.post(
      `${BASE_URL}/counter-party-score`,
      {
        connectionId: connectionId,
        comment: betaReviewComment,
        reviewerAgentId: betaAgentId
      },
      {
        headers: {
          'X-API-KEY': betaApiKey
        }
      }
    );

    const betaReview = betaScoreRes.data?.review || betaScoreRes.data?.data;
    if (!betaScoreRes.data?.success || !betaReview?.id) {
      throw new Error(`Failed to submit counterparty score. Response: ${JSON.stringify(betaScoreRes.data)}`);
    }
    recordResult('Submit Counterparty Score (Beta -> Alpha)', true, `reviewId=${betaReview.id}`);

    // -------------------------------------------------------------
    // Step 7: Duplicate Score Rejection Check
    // -------------------------------------------------------------
    console.log(`\n7. Testing duplicate score rejection (Alpha trying to score again on same connection)...`);
    try {
      await axios.post(
        `${BASE_URL}/counter-party-score`,
        {
          connectionId: connectionId,
          comment: 'Attempting duplicate review',
          reviewerAgentId: alphaAgentId
        },
        {
          headers: {
            'X-API-KEY': alphaApiKey
          }
        }
      );
      recordResult('Duplicate Review Prevention', false, 'Expected 400 error but request succeeded');
    } catch (err: any) {
      if (err.response?.status === 400) {
        recordResult('Duplicate Review Prevention', true, `Correctly rejected: "${err.response.data?.error || err.response.data?.message}"`);
      } else {
        recordResult('Duplicate Review Prevention', false, `Unexpected status code: ${err.response?.status}`);
      }
    }

    // -------------------------------------------------------------
    // Step 8: Non-Participant Authorization Rejection Check
    // -------------------------------------------------------------
    console.log(`\n8. Testing non-participant score rejection (Registering Agent Gamma to attempt unauthorized score)...`);
    const gammaEmail = `agent_gamma_${timestamp}@testdomain.org`;
    const regGammaRes = await axios.post(`${BASE_URL}/auth/register`, {
      email: gammaEmail,
      password: 'GammaSecurePassword123!',
      agentName: `Gamma_Node_${timestamp.toString().slice(-4)}`
    });
    const gammaApiKey = regGammaRes.data?.data?.apiKey || regGammaRes.data?.apiKey;

    try {
      await axios.post(
        `${BASE_URL}/counter-party-score`,
        {
          connectionId: connectionId,
          comment: 'Intruder node attempting review',
        },
        {
          headers: {
            'X-API-KEY': gammaApiKey
          }
        }
      );
      recordResult('Non-Participant Review Rejection', false, 'Expected 403 error but request succeeded');
    } catch (err: any) {
      if (err.response?.status === 403) {
        recordResult('Non-Participant Review Rejection', true, `Correctly rejected with 403 Forbidden`);
      } else {
        recordResult('Non-Participant Review Rejection', false, `Unexpected status code: ${err.response?.status}`);
      }
    }

    // -------------------------------------------------------------
    // Step 9: Query Reviews by connectionId
    // -------------------------------------------------------------
    console.log(`\n9. Querying counterparty reviews for connection ${connectionId}...`);
    const getReviewsByConnRes = await axios.get(`${BASE_URL}/counter-party-score?connectionId=${connectionId}`);
    const connReviews = getReviewsByConnRes.data?.data || [];
    if (connReviews.length >= 2) {
      recordResult('GET /api/counter-party-score by connectionId', true, `Found ${connReviews.length} reviews`);
    } else {
      recordResult('GET /api/counter-party-score by connectionId', false, `Expected at least 2 reviews, got ${connReviews.length}`);
    }

    // -------------------------------------------------------------
    // Step 10: Query Reviews by targetAgentId
    // -------------------------------------------------------------
    console.log(`\n10. Querying counterparty reviews for targetAgentId ${betaAgentId}...`);
    const getReviewsByTargetRes = await axios.get(`${BASE_URL}/counter-party-score?targetAgentId=${betaAgentId}`);
    const targetReviews = getReviewsByTargetRes.data?.data || [];
    if (targetReviews.length >= 1 && targetReviews.some((r: any) => r.reviewerAgent?.id === alphaAgentId)) {
      recordResult('GET /api/counter-party-score by targetAgentId', true, `Target has ${targetReviews.length} counterparty review(s)`);
    } else {
      recordResult('GET /api/counter-party-score by targetAgentId', false, `Target reviews count: ${targetReviews.length}`);
    }

    // -------------------------------------------------------------
    // Step 11: Query Agent Profile to verify connections & details
    // -------------------------------------------------------------
    console.log(`\n11. Querying Agent Profile for Alpha (@${alphaAgentId})...`);
    const alphaProfileRes = await axios.get(`${BASE_URL}/agents/${alphaAgentId}`);
    const alphaProfile = alphaProfileRes.data?.data;
    if (alphaProfile?.agentId === alphaAgentId && Array.isArray(alphaProfile?.connections)) {
      recordResult('GET /api/agents/:agentId', true, `Profile loaded with ${alphaProfile.connections.length} connection(s)`);
    } else {
      recordResult('GET /api/agents/:agentId', false, `Profile load failed or missing fields`);
    }

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log('\n========================================');
    console.log('=== TEST SUITE EXECUTION COMPLETED ===');
    console.log('========================================');
    const passedCount = testResults.filter(r => r.success).length;
    const failedCount = testResults.filter(r => !r.success).length;
    console.log(`Total Tests: ${testResults.length} | Passed: ${passedCount} | Failed: ${failedCount}\n`);

    if (failedCount > 0) {
      process.exit(1);
    } else {
      console.log('🎉 ALL REGISTRATION, CONNECTION & COUNTERPARTY SCORE TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    }

  } catch (error: any) {
    console.error('\n❌ Unhandled exception during test execution:', error.response?.data || error.message);
    process.exit(1);
  }
}

runTests();
