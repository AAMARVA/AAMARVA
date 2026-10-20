import { SecurityService, GLOBAL_SECURITY_POLICIES } from '../services/securityService';
import { getSupabaseClient } from '../supabase';
import { getClusterTables } from '../routes/clusterRoutes';

/**
 * CLUSTER QUOTA & RATE LIMIT VERIFICATION TESTS
 * Verifies Free-plan burst, daily, monthly, and resource limits.
 */
export async function runClusterQuotaTests() {
  console.log('--- AAMARVA CLUSTER QUOTA AUDIT ---');
  const results: Record<string, { status: string, reason: string }> = {
    burst_limit: { status: 'PENDING', reason: '' },
    daily_pacing: { status: 'PENDING', reason: '' },
    monthly_quota: { status: 'PENDING', reason: '' },
    max_active_clusters: { status: 'PENDING', reason: '' },
    identity_attribution: { status: 'PENDING', reason: '' },
    public_endpoint_ip_protection: { status: 'PENDING', reason: '' }
  };

  const securityService = SecurityService.getInstance();
  const sb = getSupabaseClient();
  const tables = await getClusterTables(sb);
  console.log('[TEST_DEBUG] Resolved Tables:', JSON.stringify(tables));

  const testUser = 'quota-test-user-' + Date.now();
  const testAgent = 'AMR-QUOTA-' + Math.floor(Math.random() * 10000);
  const testIp = '192.168.1.' + Math.floor(Math.random() * 254);

  // Helper to mock request
  const mockReq = (ip: string, userId?: string, agentId?: string) => ({
    ip,
    headers: {},
    socket: { remoteAddress: ip },
    body: {},
    user: userId ? { id: userId, agentId } : undefined
  } as any);

  try {
    // 1. Quota Accounting Test: Verify rejected requests do not consume quota
    console.log('[TEST] Verifying Quota Accounting (Rejected requests should not consume quota)...');
    const accountingUser = 'accounting-user-' + Date.now();
    try {
      const policyName = 'cluster_create';
      const policy = GLOBAL_SECURITY_POLICIES[policyName];
      
      // Hit the daily limit (1 per day for cluster_create)
      await securityService.evaluateRequest(mockReq(testIp, accountingUser, 'AMR-ACC'), policyName, accountingUser);
      
      const { data: initialQuota } = await sb
        .from('security_quotas')
        .select('dailyCount, monthlyCount')
        .eq('identifier', accountingUser)
        .eq('endpoint', policyName)
        .single();
      
      // Attempt second (should be rejected)
      try {
        await securityService.evaluateRequest(mockReq(testIp, accountingUser, 'AMR-ACC'), policyName, accountingUser);
      } catch (e: any) {
        if (e.code !== 'RATE_LIMIT_EXCEEDED' && !e.message.includes('Daily')) throw e;
      }
      
      const { data: afterRejectQuota } = await sb
        .from('security_quotas')
        .select('dailyCount, monthlyCount')
        .eq('identifier', accountingUser)
        .eq('endpoint', policyName)
        .single();
      
      if (afterRejectQuota?.dailyCount === initialQuota?.dailyCount && 
          afterRejectQuota?.monthlyCount === initialQuota?.monthlyCount) {
        results.daily_pacing.status = 'PASSED';
      } else {
        results.daily_pacing.status = 'FAILED';
        results.daily_pacing.reason = `Quota leaked: Initial ${initialQuota?.dailyCount}, After Reject ${afterRejectQuota?.dailyCount}`;
      }
    } catch (e: any) {
      results.daily_pacing.status = 'FAILED';
      results.daily_pacing.reason = e.message;
    }

    // 2. Monthly Boundary Tests (Batch)
    console.log('[TEST] Verifying Monthly Quota Boundaries...');
    const boundaryTests = [
      { name: 'cluster_create', limit: 3 },
      { name: 'cluster_invite_create', limit: 300 },
      { name: 'cluster_message_create', limit: 3000 },
      { name: 'cluster_join', limit: 100 },
      { name: 'cluster_update', limit: 300 },
      { name: 'cluster_delete', limit: 30 },
      { name: 'cluster_member_role_update', limit: 300 },
      { name: 'cluster_member_kick', limit: 300 },
      { name: 'cluster_leave', limit: 100 }
    ];

    let monthlyPassed = true;
    for (const bt of boundaryTests) {
      const bUser = `b-user-${bt.name}-${Date.now()}`;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      try {
        // Seed at limit
        await sb.from('security_quotas').upsert({
          identifier: bUser,
          endpoint: bt.name,
          monthlyCount: bt.limit,
          dailyCount: 0,
          monthStart,
          dayStart
        });

        // Should be rejected
        try {
          await securityService.evaluateRequest(mockReq(testIp, bUser, 'AMR-B'), bt.name, bUser);
          console.error(`[FAILED] Boundary test for ${bt.name}: Limit ${bt.limit} failed to block at ${bt.limit + 1}`);
          monthlyPassed = false;
        } catch (e: any) {
          if (e.code !== 'MONTHLY_QUOTA_EXCEEDED') {
            console.error(`[FAILED] Boundary test for ${bt.name}: Expected MONTHLY_QUOTA_EXCEEDED, got ${e.code}`);
            monthlyPassed = false;
          }
        }

        // Verify count didn't increase
        const { data: final } = await sb.from('security_quotas').select('monthlyCount').eq('identifier', bUser).eq('endpoint', bt.name).single();
        if (final?.monthlyCount !== bt.limit) {
          console.error(`[FAILED] Quota Accounting for ${bt.name}: Count increased from ${bt.limit} to ${final?.monthlyCount} on rejection`);
          monthlyPassed = false;
        }
      } catch (e: any) {
        console.error(`[ERROR] Boundary test for ${bt.name}: ${e.message}`);
        monthlyPassed = false;
      }
    }
    results.monthly_quota.status = monthlyPassed ? 'PASSED' : 'FAILED';

    // 3. Max Active Clusters Test (Strict Concurrency Verification)
    console.log('[TEST] Verifying Max 1 Active Cluster Rule...');
    // Existing test logic is decent but we already added the unique index, 
    // so let's verify it rejects a second active cluster insertion even if RPC was bypassed.
    try {
      const { data: realUser } = await sb.from('users').select('id, agentId').limit(1).maybeSingle();
      if (!realUser) throw new Error('No users found');

      await sb.from('clusters').delete().eq('ownerUserId', realUser.id);
      
      await sb.from('clusters').insert({
        id: 'c1-' + Date.now(),
        name: 'First Active',
        ownerUserId: realUser.id,
        ownerAgentId: realUser.agentId,
        status: 'active'
      });

      const { error: secondErr } = await sb.from('clusters').insert({
        id: 'c2-' + Date.now(),
        name: 'Second Active',
        ownerUserId: realUser.id,
        ownerAgentId: realUser.agentId,
        status: 'active'
      });

      if (secondErr && (secondErr.message.includes('unique') || secondErr.code === '23505')) {
        results.max_active_clusters.status = 'PASSED';
      } else {
        results.max_active_clusters.status = 'FAILED';
        results.max_active_clusters.reason = 'Database allowed second active cluster';
      }
      
      await sb.from('clusters').delete().eq('ownerUserId', realUser.id);
    } catch (e: any) {
      results.max_active_clusters.status = 'FAILED';
      results.max_active_clusters.reason = e.message;
    }

    // 4. Identity Isolation (Account vs IP)
    console.log('[TEST] Verifying Account Isolation (Multi-IP)...');
    try {
      const isolationUser = 'iso-user-' + Date.now();
      const ip1 = '1.1.1.1';
      const ip2 = '2.2.2.2';
      
      await securityService.evaluateRequest(mockReq(ip1, isolationUser, 'AMR-ISO'), 'cluster_list', isolationUser);
      
      const { data: q1 } = await sb.from('security_quotas').select('monthlyCount').eq('identifier', isolationUser).eq('endpoint', 'cluster_list').single();
      
      await securityService.evaluateRequest(mockReq(ip2, isolationUser, 'AMR-ISO'), 'cluster_list', isolationUser);
      
      const { data: q2 } = await sb.from('security_quotas').select('monthlyCount').eq('identifier', isolationUser).eq('endpoint', 'cluster_list').single();
      
      if (q2?.monthlyCount === (q1?.monthlyCount || 0) + 1) {
        results.identity_attribution.status = 'PASSED';
      } else {
        results.identity_attribution.status = 'FAILED';
        results.identity_attribution.reason = 'Quota not shared across IPs for same account';
      }
    } catch (e: any) {
      results.identity_attribution.status = 'FAILED';
      results.identity_attribution.reason = e.message;
    }

    // 5. Public IP Isolation
    console.log('[TEST] Verifying Public IP Isolation...');
    try {
      const pubIp1 = '9.9.9.1';
      const pubIp2 = '9.9.9.2';
      const pubPolicy = 'public_cluster_recent';
      
      await securityService.evaluateRequest(mockReq(pubIp1), pubPolicy);
      await securityService.evaluateRequest(mockReq(pubIp2), pubPolicy);
      
      const { data: pq1 } = await sb.from('security_quotas').select('monthlyCount').eq('identifier', pubIp1).eq('endpoint', pubPolicy).single();
      const { data: pq2 } = await sb.from('security_quotas').select('monthlyCount').eq('identifier', pubIp2).eq('endpoint', pubPolicy).single();
      
      if (pq1?.monthlyCount === 1 && pq2?.monthlyCount === 1) {
        results.public_endpoint_ip_protection.status = 'PASSED';
      } else {
        results.public_endpoint_ip_protection.status = 'FAILED';
        results.public_endpoint_ip_protection.reason = 'Public quota leaked across IPs';
      }
    } catch (e: any) {
      results.public_endpoint_ip_protection.status = 'FAILED';
      results.public_endpoint_ip_protection.reason = e.message;
    }

  } catch (err: any) {
    console.error('[CLUSTER QUOTA TEST ERROR]', err);
  }

  // 6. Concurrency Stress Test: Simultaneous First Requests
  console.log('[TEST] Verifying Concurrency Atomicity (Simultaneous First Requests)...');
  try {
    const concurrentUser = 'concurrent-user-' + Date.now();
    const concurrentIp = '172.16.0.1';
    const policyName = 'cluster_join'; // Limit: 100/month
    
    // Send 10 simultaneous requests
    const requests = Array.from({ length: 10 }).map(() => 
      securityService.evaluateRequest(mockReq(concurrentIp, concurrentUser, 'AMR-CONC'), policyName, concurrentUser)
    );
    
    await Promise.all(requests);
    
    const { data: finalQuota } = await sb
      .from('security_quotas')
      .select('monthlyCount')
      .eq('identifier', concurrentUser)
      .eq('endpoint', policyName)
      .single();
    
    if (finalQuota?.monthlyCount === 10) {
      console.log('[PASSED] Concurrency Test: Exactly 10 units consumed.');
    } else {
      console.error(`[FAILED] Concurrency Test: Expected 10 units, got ${finalQuota?.monthlyCount}`);
    }
  } catch (e: any) {
    console.error('[FAILED] Concurrency Test Error:', e.message);
  }

  // 7. Concurrency Boundary Test: Simultaneous requests at hard limit
  console.log('[TEST] Verifying Boundary Concurrency (Limit - 1 transition)...');
  try {
    const boundaryUser = 'boundary-conc-' + Date.now();
    const policyName = 'cluster_create'; // Limit: 3/month
    const limit = 3;
    
    // Seed at 2/3
    await sb.from('security_quotas').upsert({
      identifier: boundaryUser,
      endpoint: policyName,
      monthlyCount: limit - 1,
      dailyCount: 0,
      monthStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      dayStart: new Date().toISOString()
    });
    
    // Send 5 simultaneous requests (only 1 should succeed)
    const results = await Promise.allSettled(Array.from({ length: 5 }).map(() => 
      securityService.evaluateRequest(mockReq('1.2.3.4', boundaryUser, 'AMR-B'), policyName, boundaryUser)
    ));
    
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const rejected = results.filter(r => r.status === 'rejected').length;
    
    const { data: final } = await sb.from('security_quotas').select('monthlyCount').eq('identifier', boundaryUser).eq('endpoint', policyName).single();
    
    if (succeeded === 1 && final?.monthlyCount === limit) {
      console.log(`[PASSED] Boundary Concurrency: Exactly ${succeeded} succeeded, total ${final?.monthlyCount}/${limit}`);
    } else {
      console.error(`[FAILED] Boundary Concurrency: ${succeeded} succeeded (expected 1), final count ${final?.monthlyCount} (expected ${limit})`);
    }
  } catch (e: any) {
    console.error('[ERROR] Boundary Concurrency Error:', e.message);
  }

  // 8. Fail-Closed Verification (Database Unavailable)
  console.log('[TEST] Verifying Fail-Closed Behavior (RPC Unavailable)...');
  try {
    const failUser = 'fail-user-' + Date.now();
    // Simulate DB failure by corrupting the tableExistence map
    (securityService as any).tableExistence.check_cluster_quota_atomic = false;
    
    try {
      await securityService.evaluateRequest(mockReq('127.0.0.1', failUser), 'cluster_create', failUser);
      console.error('[FAILED] Fail-Closed: Request allowed while DB is "unavailable"');
    } catch (e: any) {
      if (e.code === 'DATABASE_UNAVAILABLE') {
        console.log('[PASSED] Fail-Closed: Request rejected with DATABASE_UNAVAILABLE');
      } else {
        console.error(`[FAILED] Fail-Closed: Expected DATABASE_UNAVAILABLE, got ${e.code}`);
      }
    } finally {
      // Restore state
      (securityService as any).tableExistence.check_cluster_quota_atomic = true;
    }
  } catch (e: any) {
    console.error('[ERROR] Fail-Closed Test Error:', e.message);
  }

  // 9. Fail-Closed for Non-Critical Quota Endpoints
  console.log('[TEST] Verifying Fail-Closed for Non-Critical Quota Endpoints...');
  try {
    const nonCriticalUser = 'non-crit-user-' + Date.now();
    // Simulate DB failure
    (securityService as any).tableExistence.check_cluster_quota_atomic = false;
    
    try {
      // cluster_list is typically non-critical but has an authoritative quota
      await securityService.evaluateRequest(mockReq('127.0.0.1', nonCriticalUser), 'cluster_list', nonCriticalUser);
      console.error('[FAILED] Non-Critical Fail-Closed: Request allowed for cluster_list while DB is unavailable');
    } catch (e: any) {
      if (e.code === 'DATABASE_UNAVAILABLE') {
        console.log('[PASSED] Non-Critical Fail-Closed: cluster_list rejected with DATABASE_UNAVAILABLE');
      } else {
        console.error(`[FAILED] Non-Critical Fail-Closed: Expected DATABASE_UNAVAILABLE, got ${e.code}`);
      }
    } finally {
      // Restore state
      (securityService as any).tableExistence.check_cluster_quota_atomic = true;
    }
  } catch (e: any) {
    console.error('[ERROR] Non-Critical Fail-Closed Test Error:', e.message);
  }

  console.log('\n--- CLUSTER QUOTA TEST REPORT ---');
  Object.entries(results).forEach(([test, res]) => {
    console.log(`${test.toUpperCase()}: [${res.status}] ${res.reason}`);
  });
  
  return results;
}
