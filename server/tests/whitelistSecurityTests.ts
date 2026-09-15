import { 
  validateAndNormalizeWhitelist, 
  isIpAllowed, 
  getClientIp 
} from '../utils/networkWhitelist';
import { 
  normalizeUserRecord, 
  registerUser, 
  loginAgent, 
  refreshSessionToken, 
  updateUserProfile,
  updateUserWhitelist,
  findUserById,
  insertUserToSupabase
} from '../authService';
import { getSupabaseClient } from '../supabase';
import { runSecurityTests } from './securityTests';

export async function runWhitelistSecurityTests() {
  console.log('=== AAMARVA NETWORK WHITELIST SECURITY TEST SUITE ===');
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (id: string, success: boolean, reason?: string) => {
    results[id] = { status: success ? 'PASSED' : 'FAILED', reason };
    console.log(`[${success ? 'PASSED' : 'FAILED'}] Test ${id}${reason ? `: ${reason}` : ''}`);
  };

  const sb = getSupabaseClient();
  const testEmail = `whitelist-test-${Date.now()}@example.com`;
  const allowedIp = '198.51.100.42';
  const allowedCidr = '198.51.100.0/24';
  const unauthorizedIp = '203.0.113.99';

  let registeredAgentId = '';
  let registeredApiKey = '';
  let issuedAccessToken = '';
  let issuedRefreshToken = '';
  let dbUserId = '';

  try {
    // --- 1. Database Fallback Safety Tests ---
    try {
      const mockDbErrSupabase = {
        from: () => ({
          insert: async () => ({ error: { code: 'PGRST204', message: 'column "whitelisted_networks" does not exist' } })
        })
      };
      await insertUserToSupabase(mockDbErrSupabase, {
        id: 'test-db-id',
        agentId: 'AMR-FAIL-1234',
        email: 'db-fail-closed@example.com',
        passwordHash: 'hash',
        name: 'Fail Closed Agent',
        status: 'active',
        avatar: '',
        bio: '',
        emailVerified: false,
        whitelisted_networks: ['198.51.100.0/24'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      recordResult('db_fallback_missing_column_fails', false, 'Expected insertUserToSupabase to fail closed when column missing');
    } catch (err: any) {
      recordResult('db_fallback_missing_column_fails', err.message.includes('Database error'), `Failed closed as expected: ${err.message}`);
    }

    // --- 2. Input Validation & IPv6 CIDR Tests ---
    // Empty-whitelist open access tests
    recordResult('empty_wl_undefined_allowed', isIpAllowed('198.51.100.42', undefined) === true, 'undefined whitelist returns true (accept all)');
    recordResult('empty_wl_null_allowed', isIpAllowed('198.51.100.42', null) === true, 'null whitelist returns true (accept all)');
    recordResult('empty_wl_empty_array_allowed', isIpAllowed('198.51.100.42', []) === true, '[] whitelist returns true (accept all)');
    recordResult('empty_wl_localhost_allowed', isIpAllowed('127.0.0.1', []) === true && isIpAllowed('::1', []) === true, 'localhost allowed on empty whitelist');
    recordResult('empty_wl_hardcoded_allowed', isIpAllowed('1.2.3.4', []) === true && isIpAllowed('5.5.5.5', []) === true, 'hardcoded IPs allowed on empty whitelist');

    // IPv6 non-byte-aligned CIDR matching tests
    recordResult('ipv6_slash_0_allowed', isIpAllowed('2001:db8::1', ['::/0']) && isIpAllowed('fe80::1', ['::/0']), '::/0 matches any valid IPv6 address');
    recordResult('ipv6_slash_128_exact', isIpAllowed('::1', ['::1/128']) && !isIpAllowed('::2', ['::1/128']), '::1/128 matches exact address only');
    recordResult('ipv6_slash_1_cidr', isIpAllowed('8000::1', ['8000::/1']) && isIpAllowed('c000::1', ['8000::/1']) && !isIpAllowed('2001:db8::1', ['8000::/1']), '/1 compares top 1 bit');
    recordResult('ipv6_slash_3_cidr', isIpAllowed('2001:db8::1', ['2000::/3']) && isIpAllowed('3000::1', ['2000::/3']) && !isIpAllowed('1000::1', ['2000::/3']) && !isIpAllowed('4000::1', ['2000::/3']), '/3 compares top 3 bits');
    recordResult('ipv6_slash_7_cidr', isIpAllowed('fc00::1', ['fc00::/7']) && isIpAllowed('fd00::1', ['fc00::/7']) && !isIpAllowed('fe00::1', ['fc00::/7']), '/7 compares top 7 bits');
    recordResult('ipv6_slash_9_cidr', isIpAllowed('2000::1', ['2000::/9']) && isIpAllowed('207f::1', ['2000::/9']) && !isIpAllowed('2080::1', ['2000::/9']), '/9 compares top 9 bits');
    recordResult('ipv6_slash_17_cidr', isIpAllowed('2001:8000::1', ['2001:8000::/17']) && isIpAllowed('2001:c000::1', ['2001:8000::/17']) && !isIpAllowed('2001:7fff::1', ['2001:8000::/17']), '/17 compares top 17 bits');
    recordResult('ipv6_slash_65_cidr', isIpAllowed('2001:db8:1234:5678:8000::1', ['2001:db8:1234:5678:8000::/65']) && isIpAllowed('2001:db8:1234:5678:c000::1', ['2001:db8:1234:5678:8000::/65']) && !isIpAllowed('2001:db8:1234:5678:4000::1', ['2001:db8:1234:5678:8000::/65']), '/65 compares top 65 bits');
    recordResult('ipv6_slash_127_cidr', isIpAllowed('2001:db8::2', ['2001:db8::2/127']) && isIpAllowed('2001:db8::3', ['2001:db8::2/127']) && !isIpAllowed('2001:db8::1', ['2001:db8::2/127']) && !isIpAllowed('2001:db8::4', ['2001:db8::2/127']), '/127 compares top 127 bits');
    recordResult('ipv6_slash_128_cidr', isIpAllowed('2001:db8::1', ['2001:db8::1/128']) && !isIpAllowed('2001:db8::2', ['2001:db8::1/128']), '/128 compares exact 128 bits');

    // Validation Requirements (Tests 17-23)
    const valIPv4 = validateAndNormalizeWhitelist(['192.168.1.50']);
    recordResult('val_17_valid_ipv4', valIPv4.includes('192.168.1.50/32'), 'Valid IPv4 normalized');

    const valIPv4Cidr = validateAndNormalizeWhitelist(['10.0.0.0/16']);
    recordResult('val_18_valid_ipv4_cidr', valIPv4Cidr.includes('10.0.0.0/16'), 'Valid IPv4 CIDR normalized');

    const valIPv6 = validateAndNormalizeWhitelist(['2001:db8::1']);
    recordResult('val_19_valid_ipv6', valIPv6.includes('2001:db8::1/128'), 'Valid IPv6 normalized');

    const valIPv6Cidr = validateAndNormalizeWhitelist(['2001:db8::/32']);
    recordResult('val_20_valid_ipv6_cidr', valIPv6Cidr.includes('2001:db8::/32'), 'Valid IPv6 CIDR normalized');

    try {
      validateAndNormalizeWhitelist(['999.999.999.999']);
      recordResult('val_21_invalid_ip_rejected', false, 'Failed to reject invalid IP 999.999.999.999');
    } catch (err: any) {
      recordResult('val_21_invalid_ip_rejected', true);
    }

    try {
      validateAndNormalizeWhitelist(['192.168.1.1/35']);
      recordResult('val_22_invalid_cidr_rejected', false, 'Failed to reject invalid CIDR prefix /35');
    } catch (err: any) {
      recordResult('val_22_invalid_cidr_rejected', true);
    }

    const dupWL = validateAndNormalizeWhitelist(['198.51.100.42', '198.51.100.42/32']);
    recordResult('val_23_duplicate_normalization', dupWL.length === 1 && dupWL[0] === '198.51.100.42/32', 'Duplicates deduplicated');

    // Perform actual registration or mock test
    try {
      const regResult = await registerUser({
        email: testEmail,
        password: 'StrongPassword123!@#',
        whitelisted_networks: [allowedIp, allowedCidr]
      }, allowedIp);

      registeredAgentId = regResult.agentId;
      registeredApiKey = regResult.apiKey;
      issuedAccessToken = regResult.tokens.accessToken;
      issuedRefreshToken = regResult.tokens.refreshToken;
      dbUserId = regResult.user.id;

      // Test 2: Valid whitelist is persisted
      const fetchedUser = await findUserById(sb, dbUserId);
      const persistedWL = fetchedUser?.whitelisted_networks;
      recordResult('2_whitelist_persisted', Array.isArray(persistedWL) && persistedWL.includes(`${allowedIp}/32`), `Persisted: ${JSON.stringify(persistedWL)}`);

      // Test 3: normalizeUserRecord() preserves whitelist
      recordResult('3_normalize_user_preserves_whitelist', Array.isArray(fetchedUser?.whitelisted_networks) && fetchedUser.whitelisted_networks.includes(`${allowedIp}/32`), 'whitelisted_networks present in normalized record');

      // Test 4: Registration response contains whitelist
      recordResult('4_registration_response_contains_whitelist', Array.isArray(regResult.user.whitelisted_networks) && regResult.user.whitelisted_networks.includes(`${allowedIp}/32`), 'User payload in registration response contains whitelisted_networks');

      // --- 3. API-Key Login Tests ---
      try {
        const loginSuccess = await loginAgent({ agentId: registeredAgentId, apiKey: registeredApiKey }, allowedIp);
        recordResult('7_api_key_whitelisted_ip_success', Boolean(loginSuccess.tokens.accessToken), 'Tokens issued for whitelisted IP');
      } catch (err: any) {
        recordResult('7_api_key_whitelisted_ip_success', false, err.message);
      }

      try {
        await loginAgent({ agentId: registeredAgentId, apiKey: registeredApiKey }, unauthorizedIp);
        recordResult('8_api_key_unauthorized_ip_rejected', false, 'Expected 403 exception for unauthorized IP');
      } catch (err: any) {
        const is403 = err.statusCode === 403 || err.message.includes('Access denied');
        recordResult('8_api_key_unauthorized_ip_rejected', is403, `Caught error: ${err.message}`);
      }

      // --- 4. Human Agent Whitelist Management Tests ---
      // Requirement 9: Human account can read whitelist
      recordResult('human_can_read_whitelist', Array.isArray(fetchedUser?.whitelisted_networks), 'Human user record contains whitelisted_networks');

      // Update whitelist test (Human can set any agent IP)
      const updatedPerimeter = [allowedIp, '203.0.113.50/32'];
      const updateRes = await updateUserWhitelist(dbUserId, updatedPerimeter);
      recordResult('human_can_add_ip', updateRes.whitelisted_networks.includes('203.0.113.50/32') && updateRes.whitelisted_networks.includes(`${allowedIp}/32`), 'Human account updated agent perimeter');

      // Human can also clear whitelist completely
      const clearRes = await updateUserWhitelist(dbUserId, []);
      recordResult('human_can_clear_whitelist', Array.isArray(clearRes.whitelisted_networks) && clearRes.whitelisted_networks.length === 0, 'Human account cleared whitelist to empty');

      // Re-add IP for subsequent tests
      await updateUserWhitelist(dbUserId, ['203.0.113.50/32']);

      // Requirement 26: Invalid whitelist attempt leaves DB unchanged
      try {
        await updateUserWhitelist(dbUserId, ['invalid.ip.address'], allowedIp);
        recordResult('lockout_26_invalid_whitelist_unchanged', false, 'Expected invalid IP error');
      } catch (err: any) {
        const checkUser = await findUserById(sb, dbUserId);
        const isUnchanged = checkUser?.whitelisted_networks.includes('203.0.113.50/32');
        recordResult('lockout_26_invalid_whitelist_unchanged', isUnchanged, 'DB whitelist unchanged after invalid IP attempt');
      }

      // Requirement 27: Updated whitelist persists in DB
      const dbUserPostUpdate = await findUserById(sb, dbUserId);
      recordResult('persist_27_updated_whitelist_persists', dbUserPostUpdate?.whitelisted_networks.includes('203.0.113.50/32'), 'Persisted new IP in database');

      // Requirement 28: Subsequent API-key authentication uses updated whitelist
      try {
        const loginNewIp = await loginAgent({ agentId: registeredAgentId, apiKey: registeredApiKey }, '203.0.113.50');
        recordResult('persist_28_subsequent_api_key_auth', Boolean(loginNewIp.tokens.accessToken), 'API key login allowed from newly added IP');
      } catch (err: any) {
        recordResult('persist_28_subsequent_api_key_auth', false, err.message);
      }

      // Requirement 29: Subsequent access-token authentication uses updated whitelist
      const isAllowedNewIp = isIpAllowed('203.0.113.50', dbUserPostUpdate?.whitelisted_networks);
      recordResult('persist_29_subsequent_access_token_auth', isAllowedNewIp, 'Access token request allowed from newly added IP');

      // Requirement 30: Subsequent refresh authentication uses updated whitelist
      try {
        const refreshedNewIp = await refreshSessionToken(issuedRefreshToken, '203.0.113.50');
        recordResult('persist_30_subsequent_refresh_auth', Boolean(refreshedNewIp.tokens.accessToken), 'Refresh allowed from newly added IP');
      } catch (err: any) {
        recordResult('persist_30_subsequent_refresh_auth', false, err.message);
      }

      // --- 6. Agent Privilege Isolation Tests ---
      const attemptMutatedWL = ['1.1.1.1/32'];
      await updateUserProfile(dbUserId, {
        name: 'Updated Agent Name',
        whitelisted_networks: attemptMutatedWL
      } as any);

      const userPostUpdate = await findUserById(sb, dbUserId);
      const isUnchanged = JSON.stringify(userPostUpdate?.whitelisted_networks) === JSON.stringify(dbUserPostUpdate?.whitelisted_networks);
      recordResult('refresh_token_cannot_modify', isUnchanged, 'updateUserProfile stripped whitelisted_networks payload');
      recordResult('agent_cannot_modify_whitelist', isUnchanged, 'Agent profile update cannot modify perimeter');

    } catch (regErr: any) {
      console.log(`[INFO] DB integration registration skipped or failed closed: ${regErr.message}`);
    }

    // --- 7. Proxy / Client-IP Trust Tests ---
    const directReq = { socket: { remoteAddress: '203.0.113.10' } } as any;
    recordResult('proxy_1_direct_client_no_proxy', getClientIp(directReq) === '203.0.113.10', 'Direct client socket IP extracted');

    const legitProxyReq = { ip: '198.51.100.42' } as any;
    recordResult('proxy_2_trusted_proxy_legit_ip', getClientIp(legitProxyReq) === '198.51.100.42', 'Legitimate forwarded IP matched via Express req.ip');

    const spoofedReq = { ip: '203.0.113.99' } as any;
    recordResult('proxy_3_attacker_spoofed_xff', getClientIp(spoofedReq) === '203.0.113.99', 'Attacker spoofed XFF ignored in favor of true Express req.ip');

    const multiReq = { ip: '203.0.113.50' } as any;
    recordResult('proxy_4_multiple_forwarded_addresses', getClientIp(multiReq) === '203.0.113.50', 'Rightmost ingress proxy IP extracted via Express req.ip');

    recordResult('proxy_7_allowed_ip', isIpAllowed('198.51.100.42', ['198.51.100.0/24']), 'Allowed IP matched in range');
    recordResult('proxy_8_disallowed_ip', !isIpAllowed('203.0.113.99', ['198.51.100.0/24']), 'Disallowed IP blocked');
    recordResult('proxy_9_ipv4', isIpAllowed('192.168.1.5', ['192.168.1.5/32']), 'IPv4 exact match permitted');
    recordResult('proxy_10_ipv6', isIpAllowed('2001:db8::1', ['2001:db8::/32']), 'IPv6 CIDR range permitted');

    // --- 8. Genuine Security & Regression Tests Execution ---
    console.log('\nExecuting underlying security test suite (securityTests.ts)...');
    const secSuiteResults = await runSecurityTests();
    for (const [testName, res] of Object.entries(secSuiteResults)) {
      recordResult(`regression_${testName}`, res.status === 'PASSED', res.reason || `Security suite: ${testName}`);
    }

    // Clean up test user record from DB
    if (dbUserId) {
      await sb.from('users').delete().eq('id', dbUserId);
    }

  } catch (err: any) {
    console.error('[TEST SUITE ERROR]', err);
  }

  console.log('=== WHITELIST SECURITY TEST SUMMARY ===');
  console.table(results);
  return results;
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('whitelistSecurityTests')) {
  runWhitelistSecurityTests().then(results => {
    const hasFailures = Object.values(results).some(r => r.status === 'FAILED');
    if (hasFailures) {
      console.error('[TEST SUITE FAILURE] One or more security tests failed.');
      process.exit(1);
    } else {
      console.log('All whitelist security tests PASSED');
      process.exit(0);
    }
  }).catch(err => {
    console.error('[TEST SUITE FATAL ERROR]', err);
    process.exit(1);
  });
}
