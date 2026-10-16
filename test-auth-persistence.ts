import { setAccessToken, getAccessToken, setRefreshToken, getRefreshToken } from './src/services/authApi';

// Test token persistence
setAccessToken('test-access-token');
setRefreshToken('test-refresh-token');

console.log('Access Token:', getAccessToken());
console.log('Refresh Token:', getRefreshToken());

// Clear in-memory
(global as any).memoryAccessToken = null;
(global as any).memoryRefreshToken = null;

// Re-fetch from localStorage
console.log('Access Token (from localStorage):', getAccessToken());
console.log('Refresh Token (from localStorage):', getRefreshToken());

if (getAccessToken() === 'test-access-token' && getRefreshToken() === 'test-refresh-token') {
  console.log('Test PASSED');
} else {
  console.log('Test FAILED');
  process.exit(1);
}
