import { rejectAgentCredentials, requireHumanSession } from '../middleware/authMiddleware';

/**
 * HUMAN SESSION EXCLUSIVE SECURITY AUDIT
 */
export async function runHumanAccessOnlyTests() {
  console.log('--- HUMAN SESSION EXCLUSIVE SECURITY ENDPOINT AUDIT ---');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  function createMockRes() {
    const res: any = {};
    res.statusCode = 200;
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data: any) => {
      res.body = data;
      return res;
    };
    return res;
  }

  // 1. Password Reset: rejectAgentCredentials blocks x-api-key header
  const req1: any = { headers: { 'x-api-key': 'sk_amr_test_key_123' } };
  const res1 = createMockRes();
  let nextCalled1 = false;
  rejectAgentCredentials(req1, res1, () => { nextCalled1 = true; });
  assert(!nextCalled1 && res1.statusCode === 403 && res1.body?.error?.code === 'AGENT_ACCESS_FORBIDDEN', 'rejectAgentCredentials blocks x-api-key with 403');

  // 2. Password Reset: rejectAgentCredentials blocks Bearer sk_amr_...
  const req2: any = { headers: { authorization: 'Bearer sk_amr_test_key_123' } };
  const res2 = createMockRes();
  let nextCalled2 = false;
  rejectAgentCredentials(req2, res2, () => { nextCalled2 = true; });
  assert(!nextCalled2 && res2.statusCode === 403 && res2.body?.error?.code === 'AGENT_ACCESS_FORBIDDEN', 'rejectAgentCredentials blocks Bearer sk_amr_... with 403');

  // 3. requireHumanSession blocks agent API key
  const req3: any = { headers: { 'x-api-key': 'sk_amr_test_key_123' } };
  const res3 = createMockRes();
  let nextCalled3 = false;
  await requireHumanSession(req3, res3, () => { nextCalled3 = true; });
  assert(!nextCalled3 && res3.statusCode === 403 && res3.body?.error?.code === 'AGENT_ACCESS_FORBIDDEN', 'requireHumanSession blocks agent API key with 403 AGENT_ACCESS_FORBIDDEN');

  // 4. requireHumanSession returns 401 when no session cookie or header is provided
  const req4: any = { headers: {} };
  const res4 = createMockRes();
  let nextCalled4 = false;
  await requireHumanSession(req4, res4, () => { nextCalled4 = true; });
  assert(!nextCalled4 && res4.statusCode === 401 && res4.body?.error?.code === 'UNAUTHORIZED', 'requireHumanSession returns 401 UNAUTHORIZED for unauthenticated request');

  // 5. rejectAgentCredentials allows clean human request (no agent key)
  const req5: any = { headers: {} };
  const res5 = createMockRes();
  let nextCalled5 = false;
  rejectAgentCredentials(req5, res5, () => { nextCalled5 = true; });
  assert(nextCalled5, 'rejectAgentCredentials passes clean human request to next()');

  console.log(`\nHUMAN ACCESS ONLY TEST SUMMARY: ${passed} PASSED, ${failed} FAILED.`);
  return { passed, failed };
}

runHumanAccessOnlyTests();
