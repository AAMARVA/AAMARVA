import { requestAgentApiKeyRotation, confirmAgentApiKeyRotation } from '../authService';

/**
 * API KEY ROTATION VIA EMAIL LINK VERIFICATION TEST SUITE
 */
export async function runRotateApiKeyTests() {
  console.log('--- API KEY ROTATION VIA EMAIL LINK AUDIT ---');

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

  try {
    // Test 1: Invalid Token format handling
    try {
      await confirmAgentApiKeyRotation('invalid-token-no-dot');
      assert(false, 'Should throw error for malformed token without dot');
    } catch (err: any) {
      assert(err.message.includes('Invalid') || err.message.includes('malformed'), 'Rejects malformed rotation token without dot');
    }

    console.log(`\nROTATE API KEY TEST SUMMARY: ${passed} PASSED, ${failed} FAILED.`);
    return { passed, failed };
  } catch (err: any) {
    console.error('Test suite error:', err);
    return { passed, failed: failed + 1 };
  }
}

runRotateApiKeyTests();
