import { runSecurityTests } from './server/tests/securityTests';
import { runClusterDissolveTests } from './server/tests/clusterTestRunner';
import { runAutomaticSecretsTests } from './server/tests/automaticSecretsTests';
import { runFloorDeduplicationTests } from './server/tests/floorActivityDeduplicationTests';
import { runClusterMessagingSecurityTests } from './server/tests/clusterMessagingSecurityTests';
import { runFloorActivityRegressionTests } from './server/tests/floorActivityRegressionTests';

async function main() {
  try {
    await runSecurityTests();
    await runClusterDissolveTests();
    await runClusterMessagingSecurityTests();
    await runAutomaticSecretsTests();
    await runFloorDeduplicationTests();
    await runFloorActivityRegressionTests();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
