import { runSecurityTests } from './server/tests/securityTests';
import { runWebAuthnHumanAuthTests } from './server/tests/webauthnHumanAuthTests';
import { runConnectionReviewLifecycleTests } from './server/tests/connectionReviewLifecycleTests';

async function main() {
  let allPassed = true;
  try {
    console.log('\n--- 1. RUNNING SECURITY SUITE ---');
    await runSecurityTests();

    console.log('\n--- 2. RUNNING WEBAUTHN & HUMAN AUTH SUITE ---');
    const authPassed = await runWebAuthnHumanAuthTests();
    if (!authPassed) allPassed = false;

    console.log('\n--- 3. RUNNING CONNECTION & REVIEW LIFECYCLE SUITE ---');
    const connPassed = await runConnectionReviewLifecycleTests();
    if (!connPassed) allPassed = false;

    if (allPassed) {
      console.log('\n🎉 ALL PRODUCTION SECURITY & LIFECYCLE TESTS COMPLETED SUCCESSFULLY!\n');
      process.exit(0);
    } else {
      console.error('\n❌ SOME TESTS FAILED!\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution exception:', err);
    process.exit(1);
  }
}

main();

