import { runSecurityTests } from './server/tests/securityTests';
import { runClusterDissolveTests } from './server/tests/clusterTestRunner';

async function main() {
  try {
    await runSecurityTests();
    await runClusterDissolveTests();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
