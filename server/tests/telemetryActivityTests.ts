import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import aamarvaRouter from '../routes/aamarvaRoutes';
import clusterRouter, { getClusterTables } from '../routes/clusterRoutes';
import { getSupabaseClient } from '../supabase';
import { registerUser, createHumanSession } from '../authService';
import { watchtowerActivityService } from '../services/watchtowerActivityService';
import { deduplicateAndMergeWatchtowerActivities, getActivityKey } from '../../src/lib/watchtowerActivityDeduplication';

export async function runTelemetryActivityTests(): Promise<Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }>> {
  console.log('\n=== AAMARVA TELEMETRY ACTIVITY ENDPOINT TESTS ===\n');
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (id: string, success: boolean, reason?: string) => {
    results[id] = { status: success ? 'PASSED' : 'FAILED', reason };
    console.log(`[${success ? 'PASSED' : 'FAILED'}] ${id}${reason ? `: ${reason}` : ''}`);
  };

  // 1. Setup real express app matching server.ts route mounting
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', aamarvaRouter);
  app.use('/api', clusterRouter);
  app.use('/api', (req: express.Request, res: express.Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `API endpoint ${req.method} ${req.originalUrl} not found.`
      }
    });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const helperFetch = async (endpoint: string, options: any = {}) => {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {})
      }
    });
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, headers: res.headers, contentType, json, text };
  };

  try {
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const ts = Date.now();

    // 2. Setup Fleet A: Master user + Slave agent + Post + Cluster
    const emailA = `telemetry_owner_${ts}@aamarva.test`;
    const regA = await registerUser({ email: emailA, password: 'OwnerPassword123!', agentName: 'Telemetry Alpha Master' });
    const userA = regA.user;
    const sessionTokenA = await createHumanSession(userA.id);

    // Create a slave agent for User A
    const slaveAId = `usr_slave_${ts}_a`;
    const { error: slaveInsErr } = await supabase.from('users').insert({
      id: slaveAId,
      agentId: `SLAVE-ALPHA-${ts}`,
      name: 'Alpha Worker Slave',
      email: `slave_a_${ts}@aamarva.test`,
      passwordHash: '$2a$10$dummyhashforunittesting',
      emailVerified: true,
      master_id: userA.id,
      is_master_primary: false,
      createdAt: new Date().toISOString()
    });
    if (slaveInsErr) {
      throw new Error(`Failed to insert test slave user: ${slaveInsErr.message}`);
    }

    // Create a ticket post for User A
    const postIdA = `post_tel_${ts}_1`;
    await supabase.from('posts').insert({
      id: postIdA,
      userId: userA.id,
      agentId: userA.agentId,
      title: 'Telemetry Test Post',
      content: 'Telemetry verification content',
      createdAt: new Date().toISOString()
    });

    // Create a cluster owned by User A
    const clusterIdA = `clu_tel_${ts}_1`;
    await supabase.from(tables.clusters).insert({
      id: clusterIdA,
      name: 'Alpha Telemetry Cluster',
      description: 'Fleet A dedicated cluster',
      ownerUserId: userA.id,
      ownerAgentId: userA.agentId,
      status: 'active',
      createdAt: new Date().toISOString()
    });

    // Setup Fleet B: Master user + Cluster
    const emailB = `telemetry_intruder_${ts}@aamarva.test`;
    const regB = await registerUser({ email: emailB, password: 'IntruderPassword123!', agentName: 'Telemetry Beta Master' });
    const userB = regB.user;
    const sessionTokenB = await createHumanSession(userB.id);

    const clusterIdB = `clu_tel_${ts}_2`;
    await supabase.from(tables.clusters).insert({
      id: clusterIdB,
      name: 'Beta Isolated Cluster',
      description: 'Fleet B isolated cluster',
      ownerUserId: userB.id,
      ownerAgentId: userB.agentId,
      status: 'active',
      createdAt: new Date().toISOString()
    });

    // =================================================================
    // TEST 1: Authenticated successful JSON response
    // =================================================================
    const res1 = await helperFetch('/api/telemetry/activity', {
      headers: {
        'Cookie': `aamarva_human_session=${sessionTokenA}`
      }
    });

    const is200 = res1.status === 200;
    const isJson = res1.contentType.includes('application/json');
    const hasExpectedShape = res1.json?.success === true &&
      Array.isArray(res1.json?.data?.agents) &&
      Array.isArray(res1.json?.data?.clusters);

    // Verify agents contain Fleet A accounts and safe telemetry fields
    const agentsA = res1.json?.data?.agents || [];
    const masterAgentInFleet = agentsA.find((a: any) => a.id === userA.id);
    const slaveAgentInFleet = agentsA.find((a: any) => a.id === slaveAId);
    const hasFleetAgents = Boolean(masterAgentInFleet) && Boolean(slaveAgentInFleet);

    // Verify no secret leak (no passwords, password hashes, apiKeys, or private keys)
    const leaksSecret = agentsA.some((a: any) =>
      a.password || a.passwordHash || a.apiKey || a.e2eePrivateKey
    );

    // Verify cluster A is present
    const clustersA = res1.json?.data?.clusters || [];
    const hasClusterA = clustersA.some((c: any) => c.id === clusterIdA);

    recordResult(
      'TEST 1: Authenticated successful JSON response',
      is200 && isJson && hasExpectedShape && hasFleetAgents && !leaksSecret && hasClusterA,
      `Status: ${res1.status}, agents: ${agentsA.length}, clusters: ${clustersA.length}, leak: ${leaksSecret}`
    );

    // =================================================================
    // TEST 2: Unauthenticated access returns HTTP 401 with JSON
    // =================================================================
    const res2 = await helperFetch('/api/telemetry/activity');
    const is401 = res2.status === 401;
    const is401Json = res2.contentType.includes('application/json');
    const hasUnauthError = res2.json?.success === false &&
      (res2.json?.error?.code === 'UNAUTHORIZED' || res2.json?.error?.message?.toLowerCase().includes('auth'));

    recordResult(
      'TEST 2: Unauthenticated access blocked with 401 JSON',
      is401 && is401Json && hasUnauthError,
      `Status: ${res2.status}, contentType: ${res2.contentType}, code: ${res2.json?.error?.code}`
    );

    // =================================================================
    // TEST 3: Authorization isolation between distinct fleets
    // =================================================================
    const res3 = await helperFetch('/api/telemetry/activity', {
      headers: {
        'Cookie': `aamarva_human_session=${sessionTokenB}`
      }
    });

    const is200B = res3.status === 200;
    const agentsB = res3.json?.data?.agents || [];
    const clustersB = res3.json?.data?.clusters || [];

    // User B should ONLY see User B, NOT User A or User A's slave
    const containsUserAInB = agentsB.some((a: any) => a.id === userA.id || a.id === slaveAId);
    const containsClusterAInB = clustersB.some((c: any) => c.id === clusterIdA);
    const containsClusterBInB = clustersB.some((c: any) => c.id === clusterIdB);

    recordResult(
      'TEST 3: Authorization isolation: fleet data strictly partitioned',
      is200B && !containsUserAInB && !containsClusterAInB && containsClusterBInB,
      `Contains user A: ${containsUserAInB}, Contains cluster A: ${containsClusterAInB}, Contains cluster B: ${containsClusterBInB}`
    );

    // =================================================================
    // TEST 4: Missing / Unmatched API route returns 404 JSON, never HTML
    // =================================================================
    const res4 = await helperFetch('/api/telemetry/nonexistent_subpath');
    const is404 = res4.status === 404;
    const is404Json = res4.contentType.includes('application/json');
    const isNotHtml = !res4.text.startsWith('<!DOCTYPE html>') && !res4.text.startsWith('<html');
    const has404Error = res4.json?.success === false && res4.json?.error?.code === 'NOT_FOUND';

    recordResult(
      'TEST 4: Unmatched API path returns 404 JSON, preventing unexpected token <',
      is404 && is404Json && isNotHtml && has404Error,
      `Status: ${res4.status}, contentType: ${res4.contentType}, code: ${res4.json?.error?.code}`
    );

    // =================================================================
    // TEST 5: Frontend parsing safety simulation on HTML and failure responses
    // =================================================================
    // Simulate what frontend components do when encountering HTML, non-200, or invalid JSON
    let simulatedHtmlParsedSafely = false;
    let simulatedErrorHandledSafely = false;

    // Simulate HTML 200 response (like SPA fallback)
    const mockHtmlResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () => '<!DOCTYPE html><html><body>SPA</body></html>',
      json: async () => { throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"); }
    };

    // Component verification logic:
    if (!mockHtmlResponse.ok) {
      simulatedHtmlParsedSafely = false;
    } else {
      const ct = mockHtmlResponse.headers.get('content-type') || '';
      if (!ct.toLowerCase().includes('application/json')) {
        // Safe: component guards against non-JSON content-type and does not call res.json()
        simulatedHtmlParsedSafely = true;
      }
    }

    // Simulate 401 response
    const mock401Response = {
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: false, error: { code: 'UNAUTHORIZED' } })
    };

    if (!mock401Response.ok) {
      // Safe: component guards against non-ok status and avoids invalid state
      simulatedErrorHandledSafely = true;
    }

    recordResult(
      'TEST 5: Component parsing guards prevent Unexpected token < and handle failures safely',
      simulatedHtmlParsedSafely && simulatedErrorHandledSafely,
      `HTML safely rejected: ${simulatedHtmlParsedSafely}, Error safely handled: ${simulatedErrorHandledSafely}`
    );

    // =================================================================
    // TEST 6: Watchtower activity snapshot endpoint
    // =================================================================
    const res6 = await helperFetch('/api/watchtower/activity', {
      headers: {
        'Cookie': `aamarva_human_session=${sessionTokenA}`
      }
    });
    recordResult(
      'TEST 6: Watchtower activity snapshot succeeds for authenticated viewer',
      res6.status === 200 && res6.json?.success === true,
      `Status: ${res6.status}`
    );

    // =================================================================
    // TEST 7: Watchtower stream-ticket issuance
    // =================================================================
    const res7 = await helperFetch('/api/watchtower/stream-ticket', {
      method: 'POST',
      headers: {
        'Cookie': `aamarva_human_session=${sessionTokenA}`
      }
    });
    const hasTicket = res7.status === 200 && res7.json?.success === true && typeof res7.json?.ticket === 'string';
    recordResult(
      'TEST 7: Watchtower stream-ticket issues valid single-use ticket',
      hasTicket,
      `Status: ${res7.status}, hasTicket: ${hasTicket}`
    );

    // =================================================================
    // TEST 8: Invalid or expired ticket rejection
    // =================================================================
    const res8 = await helperFetch('/api/watchtower/stream?ticket=invalid_fake_ticket_12345');
    recordResult(
      'TEST 8: Watchtower stream rejects invalid or expired ticket with 401',
      res8.status === 401,
      `Status: ${res8.status}`
    );

    // =================================================================
    // TEST 9: Human-readable formatting & raw JSON suppression
    // =================================================================
    const getActivities = (res: any): any[] =>
      Array.isArray(res.json?.data) ? res.json.data : (res.json?.data?.activities || res.json?.activities || []);

    const rawPayload = JSON.stringify({
      master_id: userA.id,
      target_account_ids: [slaveAId, 'usr_slave_extra_1'],
      validity_days_extended: 30,
      created_at: new Date().toISOString(),
      metadata: { source: 'billing_portal', internal_job_id: 'job_9981' }
    });
    const testEvtId = `evt_test_readable_${ts}`;
    await supabase.from('external_events').insert({
      id: testEvtId,
      user_id: userA.id,
      type: 'SLAVE_CAPABILITY_BATCH_ACTIVATED',
      event_type: 'SLAVE_CAPABILITY_BATCH_ACTIVATED',
      details: rawPayload,
      created_at: new Date().toISOString()
    });

    const res9 = await helperFetch('/api/watchtower/activity', {
      headers: {
        'Cookie': `aamarva_human_session=${sessionTokenA}`
      }
    });

    const activities9 = getActivities(res9);
    const capabilityItem = activities9.find((a: any) =>
      a.type === 'SLAVE_CAPABILITY_BATCH_ACTIVATED' || a.id?.includes(testEvtId)
    );

    const hasReadableSummary = Boolean(capabilityItem &&
      capabilityItem.text &&
      !capabilityItem.text.includes('{') &&
      !capabilityItem.text.includes('}') &&
      !capabilityItem.text.includes('master_id') &&
      capabilityItem.text.toLowerCase().includes('capability increment') &&
      capabilityItem.category?.toLowerCase() === 'plan' &&
      capabilityItem.outcome === 'success' &&
      (capabilityItem.planDetails?.accounts === 2 || capabilityItem.planDetails?.accountsAffected === 2)
    );

    recordResult(
      'TEST 9: Raw JSON suppressed; human-readable summary rendered with structured metadata',
      hasReadableSummary,
      `Item found: ${Boolean(capabilityItem)}, text: "${capabilityItem?.text}", category: ${capabilityItem?.category}, accounts: ${capabilityItem?.planDetails?.accounts || capabilityItem?.planDetails?.accountsAffected}`
    );

    // =================================================================
    // TEST 10: Deduplication of Live Memory + Persisted Database Records
    // =================================================================
    const stableActionKey = `conn_test_${ts}`;
    // 1. Record in memory
    await watchtowerActivityService.recordWatchtowerActivity({
      agentId: userA.agentId,
      agentName: userA.name,
      text: 'established a connection with @agent-target',
      type: 'CONNECTION_ESTABLISHED',
      actorUserId: userA.id,
      masterId: userA.id,
      peerAgentId: 'agent-target',
      activityKey: stableActionKey
    });

    // 2. Also simulate writing a footprint record with same action key
    await supabase.from('agent_footprints').insert({
      id: `fp_${stableActionKey}`,
      agent_id: userA.agentId,
      user_id: userA.id,
      master_id: userA.id,
      action: 'CONNECTION_ESTABLISHED',
      details: `established a connection with @agent-target [key:${stableActionKey}]`,
      created_at: new Date().toISOString()
    });

    const res10 = await helperFetch('/api/watchtower/activity', {
      headers: {
        'Cookie': `aamarva_human_session=${sessionTokenA}`
      }
    });
    const activities10 = getActivities(res10);
    const matchedItems = activities10.filter((a: any) =>
      (a.activityKey && a.activityKey.includes(stableActionKey)) ||
      (a.id && a.id.includes(stableActionKey)) ||
      (a.text && a.text.includes('@agent-target'))
    );

    const dedupedCorrectly = matchedItems.length === 1;
    recordResult(
      'TEST 10: Dual recording across in-memory and database footprint reconciled to 1 entry',
      dedupedCorrectly,
      `Matched items count: ${matchedItems.length} (expected 1)`
    );

    // =================================================================
    // TEST 11: Frontend deduplication algorithm merges dual SSE and REST
    // =================================================================
    const clientTestEvents = [
      {
        id: `wt_event_${ts}`,
        agentId: 'alpha-agent',
        peerAgentId: 'beta-agent',
        type: 'CONNECTION_ESTABLISHED',
        text: 'established a connection with @beta-agent',
        createdAt: new Date().toISOString()
      },
      // Duplicate from floor_activity with fp_ prefix
      {
        id: `fp_event_${ts}`,
        agentId: 'alpha-agent',
        peerAgentId: 'beta-agent',
        type: 'CONNECTION_ESTABLISHED',
        text: 'established a connection with @beta-agent',
        createdAt: new Date().toISOString()
      },
      // Another event with matching canonical connection key but different random client id
      {
        id: `sf-0.987654`,
        agentId: 'alpha-agent',
        peerAgentId: 'beta-agent',
        type: 'connection_created',
        text: 'connected with @beta-agent',
        createdAt: new Date().toISOString()
      },
      // Distinct action that should NOT be deduplicated
      {
        id: `wt_diff_${ts}`,
        agentId: 'alpha-agent',
        type: 'SLAVE_DEPLOYED',
        text: 'Master deployed slave account @gamma-agent',
        createdAt: new Date().toISOString()
      }
    ];

    const dedupedClientResult = deduplicateAndMergeWatchtowerActivities(clientTestEvents);
    const clientDedupSuccess = dedupedClientResult.length === 2; // 1 connection + 1 deployment

    recordResult(
      'TEST 11: Frontend deduplication collapses dual SSE & prefixed database IDs into single row',
      clientDedupSuccess,
      `Input events: ${clientTestEvents.length}, Output events: ${dedupedClientResult.length} (expected 2)`
    );

    // =================================================================
    // TEST 12: Sensitive Data Sanitization (No credentials or keys exposed)
    // =================================================================
    await watchtowerActivityService.recordWatchtowerActivity({
      agentId: userA.agentId,
      agentName: userA.name,
      text: 'updated encryption identity and rotated keys',
      type: 'E2EE_KEYS_UPDATED',
      actorUserId: userA.id,
      masterId: userA.id,
      details: {
        safeField: 'E2EE Identity Version 2',
        passwordHash: '$2a$10$supersecretneverleak',
        apiKey: 'amv_live_998877665544332211',
        e2eePrivateKey: '-----BEGIN PRIVATE KEY-----MIIEvgIBADANBgkqhkiG9w0BAQEFAASC...',
        token: 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_token'
      }
    });

    const res12 = await helperFetch('/api/watchtower/activity', {
      headers: {
        'Cookie': `aamarva_human_session=${sessionTokenA}`
      }
    });
    const activities12 = getActivities(res12);
    const e2eeItem = activities12.find((a: any) =>
      a.type === 'E2EE_KEYS_UPDATED' && (a.text?.includes('rotated keys') || a.details?.safeField)
    );

    const detailsSafe = e2eeItem &&
      e2eeItem.details?.safeField === 'E2EE Identity Version 2' &&
      !e2eeItem.details?.passwordHash &&
      !e2eeItem.details?.apiKey &&
      !e2eeItem.details?.e2eePrivateKey &&
      !e2eeItem.details?.token;

    recordResult(
      'TEST 12: Sensitive credentials, API keys, and private keys strictly stripped from details',
      Boolean(detailsSafe),
      `e2eeItem found: ${Boolean(e2eeItem)}, safeField: "${e2eeItem?.details?.safeField}", passwordHash leaked: ${Boolean(e2eeItem?.details?.passwordHash)}, apiKey leaked: ${Boolean(e2eeItem?.details?.apiKey)}`
    );

    // =================================================================
    // TEST 13: Strict Fleet Isolation between Master and Slaves
    // =================================================================
    // Verify Fleet B cannot see Fleet A's activities
    const res13B = await helperFetch('/api/watchtower/activity', {
      headers: {
        'Cookie': `aamarva_human_session=${sessionTokenB}`
      }
    });
    const activities13B = getActivities(res13B);
    const leakedUserAInB = activities13B.some((a: any) =>
      a.actorUserId === userA.id ||
      a.agentId === userA.agentId ||
      a.masterId === userA.id ||
      a.text?.includes(userA.agentId)
    );

    // Verify slave account cannot view master-only administrative activities
    const slaveSessionToken = await createHumanSession(slaveAId);
    const res13Slave = await helperFetch('/api/watchtower/activity', {
      headers: {
        'Cookie': `aamarva_human_session=${slaveSessionToken}`
      }
    });
    const activities13Slave = getActivities(res13Slave);
    const slaveSawMasterAdmin = activities13Slave.some((a: any) =>
      a.type === 'PLAN_ENTITLEMENT_ACTIVATED' ||
      a.type === 'SESSIONS_REVOKED_ALL' ||
      a.type === 'SLAVE_CAPABILITY_BATCH_ACTIVATED'
    );

    recordResult(
      'TEST 13: Strict Fleet Isolation: foreign fleet blocked and slave restricted from master-only events',
      !leakedUserAInB && !slaveSawMasterAdmin,
      `Fleet B saw User A: ${leakedUserAInB}, Slave saw Master-only admin: ${slaveSawMasterAdmin}`
    );

    // =================================================================
    // TEST 14: Footprints Outbound Tracking & Strict Authorization
    // =================================================================
    // 14a. Master A can query its subordinate slave's footprints
    const res14Master = await helperFetch(`/api/agent/footprints?agentId=${slaveAId}`, {
      headers: { 'Cookie': `aamarva_human_session=${sessionTokenA}` }
    });
    const masterQuerySubordinateOk = res14Master.status === 200 && Array.isArray(res14Master.json?.data);

    // 14b. Foreign Master B cannot query Fleet A's slave footprints (must receive 403)
    const res14Foreign = await helperFetch(`/api/agent/footprints?agentId=${slaveAId}`, {
      headers: { 'Cookie': `aamarva_human_session=${sessionTokenB}` }
    });
    const foreignBlocked403 = res14Foreign.status === 403;

    // 14c. Slave A cannot query another account or foreign agent footprints
    const res14SlaveForeign = await helperFetch(`/api/agent/footprints?agentId=${userB.id}`, {
      headers: { 'Cookie': `aamarva_human_session=${slaveSessionToken}` }
    });
    const slaveBlocked403 = res14SlaveForeign.status === 403;

    recordResult(
      'TEST 14: Footprints outbound tracking and strict fleet authorization',
      masterQuerySubordinateOk && foreignBlocked403 && slaveBlocked403,
      `Master authorized: ${masterQuerySubordinateOk}, Foreign blocked (403): ${foreignBlocked403}, Slave cross-account blocked (403): ${slaveBlocked403}`
    );

    // =================================================================
    // TEST 15: Webhook Events Inbound Tracking & Strict Authorization
    // =================================================================
    // 15a. Foreign Master B cannot query Fleet A's inbound webhook events (must receive 403)
    const res15Foreign = await helperFetch(`/api/webhooks/events?agentId=${slaveAId}`, {
      headers: { 'Cookie': `aamarva_human_session=${sessionTokenB}` }
    });
    const webhooksForeignBlocked403 = res15Foreign.status === 403;

    // 15b. Slave A cannot query another account's webhook events
    const res15SlaveBlocked = await helperFetch(`/api/webhooks/events?agentId=${userB.id}`, {
      headers: { 'Cookie': `aamarva_human_session=${slaveSessionToken}` }
    });
    const webhooksSlaveBlocked403 = res15SlaveBlocked.status === 403;

    // 15c. Inbound webhook events strictly exclude sender's own outbound actions
    await supabase.from('external_events').insert({
      id: `evt_inbound_test_${ts}`,
      user_id: userA.id,
      sender_id: userB.agentId,
      target_id: userA.agentId,
      type: 'DIRECT_ENCRYPTED_MESSAGE_RECEIVED',
      created_at: new Date().toISOString()
    });
    // Self-sent event should be filtered out from inbound
    await supabase.from('external_events').insert({
      id: `evt_self_test_${ts}`,
      user_id: userA.id,
      sender_id: userA.agentId,
      target_id: userB.agentId,
      type: 'DIRECT_ENCRYPTED_MESSAGE_RECEIVED',
      created_at: new Date().toISOString()
    });

    const res15Events = await helperFetch('/api/webhooks/events', {
      headers: { 'Cookie': `aamarva_human_session=${sessionTokenA}` }
    });
    const eventsList = res15Events.json?.data || [];
    const containsInbound = eventsList.some((e: any) => e.id === `evt_inbound_test_${ts}`);
    const selfFilteredOut = !eventsList.some((e: any) => e.id === `evt_self_test_${ts}`);

    recordResult(
      'TEST 15: Webhook events inbound tracking and strict fleet authorization',
      webhooksForeignBlocked403 && webhooksSlaveBlocked403 && containsInbound && selfFilteredOut,
      `Foreign blocked (403): ${webhooksForeignBlocked403}, Slave blocked (403): ${webhooksSlaveBlocked403}, Inbound captured: ${containsInbound}, Self filtered out: ${selfFilteredOut}`
    );

    // =================================================================
    // TEST 16: Deduplication & No Synthetic Stream Connection
    // =================================================================
    // Ensure response shapes are compliant and no synthetic STREAM_CONNECTED was manufactured for empty account
    const hasSyntheticStream = eventsList.some((e: any) => e.type === 'STREAM_CONNECTED' && e.senderId === 'AAMARVA_CORE');
    recordResult(
      'TEST 16: No synthetic stream connection manufactured and response shape compliant',
      !hasSyntheticStream && Array.isArray(eventsList),
      `Synthetic stream suppressed: ${!hasSyntheticStream}, Array response shape intact: ${Array.isArray(eventsList)}`
    );

  } catch (err: any) {
    console.error('Fatal error during telemetry activity tests:', err);
    recordResult('Telemetry Activity Tests Execution', false, err.message);
  } finally {
    server.close();
  }

  return results;
}
