import { runSecurityTests } from './server/tests/securityTests';

async function main() {
  try {
    await runSecurityTests();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
