import { runSecurityTests } from './server/tests/securityTests';
import { runClusterDissolveTests } from './server/tests/clusterTestRunner';
import { runAutomaticSecretsTests } from './server/tests/automaticSecretsTests';
import { runFloorDeduplicationTests } from './server/tests/floorActivityDeduplicationTests';

async function main() {
  try {
    await runSecurityTests();
    await runClusterDissolveTests();
    await runAutomaticSecretsTests();
    await runFloorDeduplicationTests();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
