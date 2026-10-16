import { loginAgentApi, getAccessToken, setAccessToken, setRefreshToken, getRefreshToken } from './src/services/authApi';
import { clearAllAppCaches } from './src/lib/appStateCache';

async function testAuthFlow() {
  console.log('Testing auth persistence flow...');

  // 1. Simulate Login (using mock data if needed, or just set tokens directly)
  setAccessToken('access-token-123');
  setRefreshToken('refresh-token-456');

  // 2. Simulate Reload: Clear memory
  (global as any).memoryAccessToken = null;
  (global as any).memoryRefreshToken = null;

  // 3. Verify persistence
  const at = getAccessToken();
  const rt = getRefreshToken();

  if (at === 'access-token-123' && rt === 'refresh-token-456') {
    console.log('Auth persistence test PASSED');
    process.exit(0);
  } else {
    console.log('Auth persistence test FAILED');
    process.exit(1);
  }
}

testAuthFlow();
