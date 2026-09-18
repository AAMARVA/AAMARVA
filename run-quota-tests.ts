import { runClusterQuotaTests } from './server/tests/clusterQuotaTests';
import dotenv from 'dotenv';

dotenv.config();

console.log('Starting Cluster Quota Tests...');
runClusterQuotaTests()
  .then((results) => {
    const failed = Object.values(results).some(r => r.status === 'FAILED');
    if (failed) {
      console.error('Some tests FAILED.');
      process.exit(1);
    } else {
      console.log('All tests PASSED.');
      process.exit(0);
    }
  })
  .catch(err => {
    console.error('Test runner failed:', err);
    process.exit(1);
  });
