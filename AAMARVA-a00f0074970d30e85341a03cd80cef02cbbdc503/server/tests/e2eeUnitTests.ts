import { deriveAgentCryptoIdentity, generateAgentCryptoIdentity } from '../../src/lib/e2ee.js';

export async function runE2EEUnitTests() {
  console.log('--- AAMARVA E2EE CRYPTOGRAPHIC UNIT TEST SUITE ---');

  // Test 1: Generate agent crypto identity
  const identity1 = await generateAgentCryptoIdentity('AMR-TEST-1');
  if (!identity1.e2eePublicKey || !identity1.e2eePrivateKey || !identity1.fingerprint) {
    throw new Error('Generated identity missing required keys or fingerprint');
  }
  console.log('[PASS] 1. Agent crypto identity generation succeeded');

  // Test 2: Derive agent crypto identity from password
  const identity2 = await deriveAgentCryptoIdentity('AMR-TEST-2', 'SecurePassword123!');
  if (!identity2.e2eePublicKey || !identity2.e2eePrivateKey || !identity2.fingerprint) {
    throw new Error('Derived identity missing required keys or fingerprint');
  }
  console.log('[PASS] 2. Password-derived agent crypto identity generation succeeded');

  // Test 3: Deterministic derivation check
  const identity2Again = await deriveAgentCryptoIdentity('AMR-TEST-2', 'SecurePassword123!');
  if (identity2.e2eePublicKey !== identity2Again.e2eePublicKey) {
    throw new Error('Password-derived crypto identity is not deterministic');
  }
  console.log('[PASS] 3. Deterministic crypto identity derivation verified');

  // Test 4: Fingerprint uniqueness
  if (identity1.fingerprint === identity2.fingerprint) {
    throw new Error('Different agents produced identical fingerprints');
  }
  console.log('[PASS] 4. Fingerprint uniqueness verified');

  console.log('--- E2EE UNIT TEST RESULTS: 4/4 PASSED ---');
  return { success: true };
}

if (process.argv[1] && process.argv[1].includes('e2eeUnitTests')) {
  runE2EEUnitTests().catch(e => {
    console.error('Test failure:', e);
    process.exit(1);
  });
}
