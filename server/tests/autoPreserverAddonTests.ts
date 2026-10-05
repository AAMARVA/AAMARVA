import {
  enrollAutoSecret,
  revokeAutoSecret,
  revokeAllAutoSessions,
  getDecryptedAutoSecrets,
  maskUserSecretsInText,
  getUserSecretsMetadata
} from '../services/secretsService.js';
import { getSupabaseClient } from '../supabase.js';

export async function runAutoPreserverAddonTests() {
  console.log('\n=== RUNNING AUTO-PRESERVER ADDON TESTS ===');

  // We will run this on a dummy test user UUID or an existing user if available.
  // For sandbox testing, we can use a dummy UUID. Let's make sure the user exists in Supabase,
  // or we can simulate it with a known active test user.
  const supabase = getSupabaseClient();
  const { data: users } = await supabase.from('users').select('id').limit(1);
  if (!users || users.length === 0) {
    console.log('Skipping database-dependent auto-preserver tests because no users exist.');
    return;
  }

  const testUserId = users[0].id;
  console.log(`Using existing user ${testUserId} for integration verification.`);

  try {
    // Clean up any existing auto secrets
    await revokeAllAutoSessions(testUserId);
    await revokeAutoSecret(testUserId, 'password');
    await revokeAutoSecret(testUserId, 'api_key');

    // 1. Enroll active credentials
    console.log('Test 1: Enrolling active credentials...');
    const testPassword = 'MySecretActivePassword2026!';
    const testApiKey = 'sk_amr_myactiveapikey123456789';
    const testSessionToken = 'session_uuid_9999988888';

    await enrollAutoSecret(testUserId, 'password', testPassword);
    await enrollAutoSecret(testUserId, 'api_key', testApiKey);
    await enrollAutoSecret(testUserId, 'session_token', testSessionToken, { identifier: 'session-999' });

    // 2. Decrypt & Verify
    console.log('Test 2: Retrieving decrypted credentials in memory...');
    const decrypted = await getDecryptedAutoSecrets(testUserId);
    const hasPassword = decrypted.includes(testPassword);
    const hasApiKey = decrypted.includes(testApiKey);
    const hasSession = decrypted.includes(testSessionToken);

    if (hasPassword && hasApiKey && hasSession) {
      console.log('  -> PASS: All active credentials successfully stored and decrypted.');
    } else {
      throw new Error(`Credential decryption failure. Found: ${JSON.stringify(decrypted)}`);
    }

    // 3. User & Agent UI Isolation (Anti-Exposure Check)
    console.log('Test 3: Verifying human/agent UI isolation...');
    const metadata = await getUserSecretsMetadata(testUserId);
    const exposed = metadata.some(m => m.keyName.includes('System') || m.id.includes('auto_'));
    if (!exposed) {
      console.log('  -> PASS: Auto-preserved secrets are strictly hidden from UI/agent metadata queries.');
    } else {
      throw new Error('Exposure detected! Auto-preserved secrets are visible in user-facing metadata.');
    }

    // 4. Transmission / Content Masking Integration
    console.log('Test 4: Verifying post/reply/message masking...');
    const unsafePost = `Hey floor, checkout my credentials: password is ${testPassword} and my api key is ${testApiKey}! Also my session is ${testSessionToken}.`;
    const masked = await maskUserSecretsInText(testUserId, unsafePost);
    console.log(`  Original: "${unsafePost}"`);
    console.log(`  Masked:   "${masked}"`);

    if (!masked.includes(testPassword) && !masked.includes(testApiKey) && !masked.includes(testSessionToken)) {
      console.log('  -> PASS: All auto-preserved active secrets were successfully masked.');
    } else {
      throw new Error('Masking failure: some active secrets leaked!');
    }

    // 5. Automatic Replacement on Change
    console.log('Test 5: Verifying automatic replacement on credential change...');
    const newPassword = 'MyNewRotatedPassword777!';
    await enrollAutoSecret(testUserId, 'password', newPassword);

    const decryptedAfterChange = await getDecryptedAutoSecrets(testUserId);
    if (!decryptedAfterChange.includes(testPassword) && decryptedAfterChange.includes(newPassword)) {
      console.log('  -> PASS: Old password was automatically evicted, and new password was preserved.');
    } else {
      throw new Error('Replacement failure: old password not evicted or new password not enrolled.');
    }

    // 6. Token Revocation & Eviction
    console.log('Test 6: Verifying specific token revocation...');
    await revokeAutoSecret(testUserId, 'session_token', 'session-999');
    const decryptedAfterRevoke = await getDecryptedAutoSecrets(testUserId);
    if (!decryptedAfterRevoke.includes(testSessionToken)) {
      console.log('  -> PASS: Session token was successfully evicted on revocation.');
    } else {
      throw new Error('Eviction failure: session token still present after revocation.');
    }

    // 7. Global Logout Session Cleansing
    console.log('Test 7: Verifying global session cleansing on logout...');
    // Enroll a session token
    await enrollAutoSecret(testUserId, 'session_token', 'temp-session-token');
    await revokeAllAutoSessions(testUserId);

    const decryptedAfterGlobalLogout = await getDecryptedAutoSecrets(testUserId);
    const hasTempSession = decryptedAfterGlobalLogout.includes('temp-session-token');
    const hasNewPassword = decryptedAfterGlobalLogout.includes(newPassword);

    if (!hasTempSession && hasNewPassword) {
      console.log('  -> PASS: All sessions were wiped on global logout while permanent account credentials remained protected.');
    } else {
      throw new Error('Logout wipe failure: sessions not cleared or password lost.');
    }

    // Cleanup
    await revokeAllAutoSessions(testUserId);
    await revokeAutoSecret(testUserId, 'password');
    await revokeAutoSecret(testUserId, 'api_key');
    console.log('=== AUTO-PRESERVER ADDON TESTS COMPLETED: 100% SUCCESS ===\n');

  } catch (err: any) {
    console.error('=== AUTO-PRESERVER ADDON TESTS FAILED ===');
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('autoPreserverAddonTests.ts')) {
  runAutoPreserverAddonTests().then(() => process.exit(0));
}
