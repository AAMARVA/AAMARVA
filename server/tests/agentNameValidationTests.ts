import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import authRoutes from '../routes/authRoutes';
import aamarvaRoutes from '../routes/aamarvaRoutes';
import { registerUser, createHumanSession } from '../authService';
import { getSupabaseClient } from '../supabase';

export async function runAgentNameValidationTests(): Promise<Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }>> {
  console.log('\n=== AAMARVA AGENT NAME 20-CHARACTER LIMIT TEST SUITE ===\n');
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (id: string, success: boolean, reason?: string) => {
    results[id] = { status: success ? 'PASSED' : 'FAILED', reason };
    console.log(`[${success ? 'PASSED' : 'FAILED'}] ${id}${reason ? `: ${reason}` : ''}`);
  };

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', authRoutes);
  app.use('/api', aamarvaRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const helperFetch = async (endpoint: string, options: any = {}) => {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  };

  const ts = Date.now();

  try {
    // 1. Registration with agentName > 20 characters must be rejected with 400
    const name21Chars = '123456789012345678901'; // 21 characters
    const regLongRes = await helperFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: `reg_long_${ts}@aamarva.test`,
        password: 'ValidPassword123!',
        agentName: name21Chars
      })
    });
    const regLongRejected = regLongRes.status === 400 && regLongRes.json?.error?.message?.includes('20 characters');
    recordResult(
      'register_rejects_name_over_20_chars',
      regLongRejected,
      `Status: ${regLongRes.status}, Error: ${regLongRes.json?.error?.message}`
    );

    // 2. Registration with agentName <= 20 characters must succeed
    const name20Chars = '12345678901234567890'; // Exactly 20 characters
    const regValidRes = await helperFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: `reg_valid_${ts}@aamarva.test`,
        password: 'ValidPassword123!',
        agentName: name20Chars
      })
    });
    const regValidPassed = regValidRes.status === 201 && regValidRes.json?.success === true;
    recordResult(
      'register_allows_name_up_to_20_chars',
      regValidPassed,
      `Status: ${regValidRes.status}, User: ${regValidRes.json?.user?.name}`
    );

    // 3. Registration with non-name field > 20 characters (e.g. bio of 120 chars) must succeed
    // (Enforcing limit for name ONLY, not bio)
    const bio120Chars = 'This is a long autonomous agent bio that exceeds 20 characters because the limit applies strictly to name only.';
    const regBioRes = await helperFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: `reg_bio_${ts}@aamarva.test`,
        password: 'ValidPassword123!',
        agentName: 'ValidName',
        bio: bio120Chars
      })
    });
    const regBioPassed = regBioRes.status === 201 && regBioRes.json?.success === true;
    recordResult(
      'register_allows_bio_over_20_chars_for_name_only_rule',
      regBioPassed,
      `Status: ${regBioRes.status}, Bio length: ${bio120Chars.length}`
    );

    // 4. Authenticate a user session to test profile update and slave creation
    const testUser = await registerUser({
      email: `test_operator_${ts}@aamarva.test`,
      password: 'ValidPassword123!',
      agentName: 'OpNode'
    });
    const sessionToken = await createHumanSession(testUser.user.id);
    const authHeaders = {
      Cookie: `aamarva_human_session=${sessionToken}`
    };

    // 5. Profile Update (PATCH /api/agents/me) with name > 20 characters must be rejected
    const patchLongRes = await helperFetch('/api/agents/me', {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'DisplayNameExceeding20Chars'
      })
    });
    const patchLongRejected = patchLongRes.status === 400 && patchLongRes.json?.error?.message?.includes('20 characters');
    recordResult(
      'profile_update_rejects_name_over_20_chars',
      patchLongRejected,
      `Status: ${patchLongRes.status}, Error: ${patchLongRes.json?.error?.message}`
    );

    // 6. Profile Update (PATCH /api/agents/me) with name <= 20 characters must succeed
    const patchValidRes = await helperFetch('/api/agents/me', {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'ValidName20CharMax' // 18 chars
      })
    });
    const patchValidPassed = patchValidRes.status === 200 && patchValidRes.json?.success === true;
    recordResult(
      'profile_update_allows_name_up_to_20_chars',
      patchValidPassed,
      `Status: ${patchValidRes.status}, Name: ${patchValidRes.json?.data?.name}`
    );

    // 7. Profile Update with long bio (e.g. 100 characters) must succeed
    const patchBioRes = await helperFetch('/api/agents/me', {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        bio: 'Updated bio with 100 characters to confirm name-only character boundary is strictly respected in PATCH.'
      })
    });
    const patchBioPassed = patchBioRes.status === 200 && patchBioRes.json?.success === true;
    recordResult(
      'profile_update_allows_bio_over_20_chars_for_name_only_rule',
      patchBioPassed,
      `Status: ${patchBioRes.status}`
    );

    // 8. Slave Creation (POST /api/auth/master/create-slave-agent) with agentName > 20 characters must be rejected
    const slaveLongRes = await helperFetch('/api/auth/master/create-slave-agent', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        agentName: 'SlaveAgentNameTooLongOver20'
      })
    });
    const slaveLongRejected = slaveLongRes.status === 400 && slaveLongRes.json?.error?.message?.includes('20 characters');
    recordResult(
      'slave_create_rejects_name_over_20_chars',
      slaveLongRejected,
      `Status: ${slaveLongRes.status}, Error: ${slaveLongRes.json?.error?.message}`
    );

    // 9. Slave Creation with valid agentName <= 20 characters
    // Ensure test user has plan allowance so creation succeeds
    const supabase = getSupabaseClient();
    await supabase.from('users').update({
      plan: { status: 'active', allowance_accounts: 5 },
      allowance: 5
    }).eq('id', testUser.user.id);
    await supabase.from('master_plan_entitlements').insert({
      id: `mpe_${testUser.user.id}`,
      master_account_id: testUser.user.id,
      status: 'active',
      allowance_accounts: 10,
      metadata: {
        blocks: [{
          id: `block_1_${testUser.user.id}`,
          allowance: 10,
          expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
        }]
      },
      expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const slaveValidRes = await helperFetch('/api/auth/master/create-slave-agent', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        agentName: 'Sentinel-Node-01' // 16 chars
      })
    });
    const slaveValidPassed = (slaveValidRes.status === 200 || slaveValidRes.status === 201) && slaveValidRes.json?.success === true;
    recordResult(
      'slave_create_allows_name_up_to_20_chars',
      slaveValidPassed,
      `Status: ${slaveValidRes.status}, Name: ${slaveValidRes.json?.data?.user?.name}`
    );

  } catch (err: any) {
    recordResult('unhandled_exception', false, err?.message || String(err));
  } finally {
    server.close();
  }

  return results;
}
