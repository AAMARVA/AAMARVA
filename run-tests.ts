import { runSecurityTests } from './server/tests/securityTests';
import { runClusterDissolveTests } from './server/tests/clusterTestRunner';
import { runAutomaticSecretsTests } from './server/tests/automaticSecretsTests';
import { runFloorDeduplicationTests } from './server/tests/floorActivityDeduplicationTests';
import { runClusterMessagingSecurityTests } from './server/tests/clusterMessagingSecurityTests';
import { runFloorActivityRegressionTests } from './server/tests/floorActivityRegressionTests';

function checkSuiteFailures(suiteName: string, results: any): boolean {
  if (results === undefined || results === null) return false;
  let hasFailed = false;
  if (typeof results === 'boolean') {
    if (!results) {
      console.error(`[SUITE FAILURE] ${suiteName} returned false`);
      hasFailed = true;
    } else {
      console.log(`[SUITE SUCCESS] ${suiteName} passed boolean check`);
    }
    return hasFailed;
  }
  if (typeof results === 'object') {
    for (const [key, value] of Object.entries(results)) {
      const entry = value as any;
      if (entry && typeof entry === 'object') {
        const statusStr = String(entry.status || '').toUpperCase();
        if (statusStr === 'FAILED' || statusStr === 'FAIL') {
          console.error(`[SUITE FAILURE] ${suiteName} -> Test '${key}' status: '${entry.status}' (reason: ${entry.reason || 'None'})`);
          hasFailed = true;
        }
      }
    }
  }
  if (!hasFailed) {
    console.log(`[SUITE SUCCESS] ${suiteName} completed with 0 failures`);
  }
  return hasFailed;
}

async function main() {
  let anyFailed = false;
  try {
    const resSec = await runSecurityTests();
    if (checkSuiteFailures('SecurityTests', resSec)) anyFailed = true;

    const resDiss = await runClusterDissolveTests();
    if (checkSuiteFailures('ClusterDissolveTests', resDiss)) anyFailed = true;

    const resMsg = await runClusterMessagingSecurityTests();
    if (checkSuiteFailures('ClusterMessagingSecurityTests', resMsg)) anyFailed = true;

    const resSecrets = await runAutomaticSecretsTests();
    if (checkSuiteFailures('AutomaticSecretsTests', resSecrets)) anyFailed = true;

    const resFloorDedup = await runFloorDeduplicationTests();
    if (checkSuiteFailures('FloorDeduplicationTests', resFloorDedup)) anyFailed = true;

    const resFloorReg = await runFloorActivityRegressionTests();
    if (checkSuiteFailures('FloorActivityRegressionTests', resFloorReg)) anyFailed = true;

    if (anyFailed) {
      console.error('\n❌ MASTER TEST RUNNER: One or more test suites REPORTED FAILURES.');
      process.exit(1);
    } else {
      console.log('\n✅ MASTER TEST RUNNER: All test suites completed successfully with ZERO failures.');
      process.exit(0);
    }
  } catch (err) {
    console.error('\n❌ MASTER TEST RUNNER EXCEPTION:', err);
    process.exit(1);
  }
}

main();
