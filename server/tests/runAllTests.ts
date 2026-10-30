import { runE2EEUnitTests } from './e2eeUnitTests.ts';
import { runE2EESessionTestSuite } from './e2eeSessionTestSuite.ts';
import { runE2EERegistrationTests } from './e2eeRegistrationTests.ts';
import { runE2EEHardeningTests } from './e2eeHardeningTests.ts';
import { runClusterMessagingSecurityTests } from './clusterMessagingSecurityTests.ts';
import { runClusterHumanOnlyTests } from './clusterHumanOnlyTests.ts';
import { runClusterMemberEditTests } from './clusterMemberEditTests.ts';
import { runObsoleteEndpointRegressionTests } from './obsoleteEndpointRegressionTests.ts';
import { runTelemetryActivityTests } from './telemetryActivityTests.ts';
import { runFloorMcpServerTests } from './floorMcpServerTests.ts';
import { runFloorMcpAuditTestSuite } from './floorMcpAuditTestSuite.ts';
import { runDirectConnectionAndClusterTests } from './directConnectionAndClusterTests.ts';
import { runCapabilityMessagingRateLimitTests } from './capabilityMessagingRateLimitTests.ts';
import { runAgentNameValidationTests } from './agentNameValidationTests.ts';
import { runQwenLangchainIntegrationTests } from './qwenLangchainIntegrationTests.ts';
import { runFloorAgentFacingApiTests } from './floorAgentFacingApiTests.ts';
import { runClusterMessageIdentityTests } from './clusterMessageIdentityTests.ts';

async function runAll() {
  const suites = [
    { name: 'e2eeUnitTests', fn: runE2EEUnitTests },
    { name: 'e2eeSessionTestSuite', fn: runE2EESessionTestSuite },
    { name: 'e2eeRegistrationTests', fn: runE2EERegistrationTests },
    { name: 'e2eeHardeningTests', fn: runE2EEHardeningTests },
    { name: 'clusterMessagingSecurityTests', fn: runClusterMessagingSecurityTests },
    { name: 'clusterMessageIdentityTests', fn: runClusterMessageIdentityTests },
    { name: 'clusterHumanOnlyTests', fn: runClusterHumanOnlyTests },
    { name: 'clusterMemberEditTests', fn: runClusterMemberEditTests },
    { name: 'obsoleteEndpointRegressionTests', fn: runObsoleteEndpointRegressionTests },
    { name: 'telemetryActivityTests', fn: runTelemetryActivityTests },
    { name: 'floorMcpServerTests', fn: runFloorMcpServerTests },
    { name: 'floorMcpAuditTestSuite', fn: runFloorMcpAuditTestSuite },
    { name: 'floorAgentFacingApiTests', fn: runFloorAgentFacingApiTests },
    { name: 'directConnectionAndClusterTests', fn: runDirectConnectionAndClusterTests },
    { name: 'capabilityMessagingRateLimitTests', fn: runCapabilityMessagingRateLimitTests },
    { name: 'agentNameValidationTests', fn: runAgentNameValidationTests },
    { name: 'qwenLangchainIntegrationTests', fn: runQwenLangchainIntegrationTests }
  ];

  let hasFailure = false;
  for (const s of suites) {
    try {
      const res = await s.fn();
      if (res && typeof res === 'object') {
        const entries = Object.entries(res);
        const failedEntry = entries.find(([k, v]: [string, any]) => v === false || v?.status === 'FAILED' || v?.passed === false);
        if (failedEntry) {
          console.error('[FAILURE] Test suite ' + s.name + ' reported failures in entry:', JSON.stringify(failedEntry, null, 2));
          hasFailure = true;
        }
      }
    } catch (err) {
      console.error('[FAILURE] Test suite ' + s.name + ' threw error:', err);
      hasFailure = true;
    }
  }

  if (hasFailure) {
    console.error('\n[FAILURE] Aggregate test run failed.');
    process.exit(1);
  } else {
    console.log('\n[SUCCESS] All test suites PASSED.');
    process.exit(0);
  }
}

runAll().catch(e => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
