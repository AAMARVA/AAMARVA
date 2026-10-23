import fs from 'fs';
import path from 'path';

export async function runObsoleteEndpointRegressionTests(): Promise<Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }>> {
  console.log('\n=== AAMARVA OBSOLETE COUNTER-PARTY-SCORE ENDPOINT REGRESSION SUITE ===\n');
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (id: string, success: boolean, reason?: string) => {
    results[id] = { status: success ? 'PASSED' : 'FAILED', reason };
    console.log(`[${success ? 'PASSED' : 'FAILED'}] ${id}${reason ? `: ${reason}` : ''}`);
  };

  try {
    // Test 1: Verify no frontend files contain references to '/api/counter-party-score'
    const srcDir = path.resolve(process.cwd(), 'src');
    const findInFiles = (dir: string, pattern: RegExp): string[] => {
      let matches: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          matches = matches.concat(findInFiles(fullPath, pattern));
        } else if (entry.isFile() && /\.(tsx?|jsx?|html|css)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (pattern.test(content)) {
            matches.push(fullPath);
          }
        }
      }
      return matches;
    };

    const frontendMatches = findInFiles(srcDir, /counter-party-score/i);
    if (frontendMatches.length === 0) {
      recordResult('frontend_zero_counter_party_score_references', true, 'Zero occurrences in src/');
    } else {
      recordResult('frontend_zero_counter_party_score_references', false, `Found in: ${frontendMatches.join(', ')}`);
    }

    // Test 2: Verify UserDashboardView has no reviewInterval or fetchReviews polling
    const userDashboardPath = path.resolve(srcDir, 'components', 'UserDashboardView.tsx');
    const userDashboardContent = fs.readFileSync(userDashboardPath, 'utf-8');
    const hasDashboardPolling = /fetchReviews|reviewInterval|counter-party-score/.test(userDashboardContent);
    if (!hasDashboardPolling) {
      recordResult('user_dashboard_view_no_polling', true, 'No polling interval or endpoint fetch in UserDashboardView');
    } else {
      recordResult('user_dashboard_view_no_polling', false, 'Found lingering polling or endpoint fetch in UserDashboardView');
    }

    // Test 3: Verify UserDashboardViewTablet has no reviewInterval or fetchReviews polling
    const userDashboardTabletPath = path.resolve(srcDir, 'components', 'UserDashboardViewTablet.tsx');
    const userDashboardTabletContent = fs.readFileSync(userDashboardTabletPath, 'utf-8');
    const hasTabletPolling = /fetchReviews|reviewInterval|counter-party-score/.test(userDashboardTabletContent);
    if (!hasTabletPolling) {
      recordResult('user_dashboard_tablet_no_polling', true, 'No polling interval or endpoint fetch in UserDashboardViewTablet');
    } else {
      recordResult('user_dashboard_tablet_no_polling', false, 'Found lingering polling or endpoint fetch in UserDashboardViewTablet');
    }

    // Test 4: Verify LoadoutsBox rate limit documentation table does not contain counter-party-score
    const loadoutsPath = path.resolve(srcDir, 'components', 'LoadoutsBox.tsx');
    const loadoutsContent = fs.readFileSync(loadoutsPath, 'utf-8');
    const hasLoadoutsScore = /counter-party-score/i.test(loadoutsContent);
    if (!hasLoadoutsScore) {
      recordResult('loadouts_box_no_obsolete_rate_limits', true, 'No counter-party-score entries in LoadoutsBox rate limits');
    } else {
      recordResult('loadouts_box_no_obsolete_rate_limits', false, 'Found counter-party-score in LoadoutsBox');
    }

    // Test 5: Verify AccessManagementCard does not register counter_party_score policies
    const accessMgmtPath = path.resolve(srcDir, 'components', 'AccessManagementCard.tsx');
    const accessMgmtContent = fs.readFileSync(accessMgmtPath, 'utf-8');
    const hasAccessMgmtPolicy = /counter_party_score|counter_party_delete/.test(accessMgmtContent);
    if (!hasAccessMgmtPolicy) {
      recordResult('access_management_no_obsolete_policies', true, 'No counter_party policies in AccessManagementCard');
    } else {
      recordResult('access_management_no_obsolete_policies', false, 'Found counter_party policies in AccessManagementCard');
    }

    // Test 6: Verify backend securityService does not enforce obsolete policies
    const secServicePath = path.resolve(process.cwd(), 'server', 'services', 'securityService.ts');
    const secServiceContent = fs.readFileSync(secServicePath, 'utf-8');
    const hasSecServiceScore = /['"]counter_party_score['"]|['"]counter_party_delete['"]|['"]\/counter-party-score['"]/.test(secServiceContent);
    if (!hasSecServiceScore) {
      recordResult('security_service_no_obsolete_policies', true, 'No counter_party_score policies in securityService.ts');
    } else {
      recordResult('security_service_no_obsolete_policies', false, 'Found lingering policies in securityService.ts');
    }

    // Test 7: Verify slaveActivityMiddleware does not reference obsolete endpoint
    const slaveMidPath = path.resolve(process.cwd(), 'server', 'middleware', 'slaveActivityMiddleware.ts');
    const slaveMidContent = fs.readFileSync(slaveMidPath, 'utf-8');
    const hasSlaveMidScore = /['"]\/counter-party-score['"]/.test(slaveMidContent);
    if (!hasSlaveMidScore) {
      recordResult('slave_activity_middleware_no_obsolete_endpoint', true, 'No /counter-party-score in slaveActivityMiddleware.ts');
    } else {
      recordResult('slave_activity_middleware_no_obsolete_endpoint', false, 'Found /counter-party-score in slaveActivityMiddleware.ts');
    }

    // Test 8: Verify cluster routes GET /api/clusters/:clusterId and GET /api/clusters/:clusterId/members/crypto are preserved
    const clusterRoutesPath = path.resolve(process.cwd(), 'server', 'routes', 'clusterRoutes.ts');
    const clusterRoutesContent = fs.readFileSync(clusterRoutesPath, 'utf-8');
    const hasClusterGet = /router\.get\(['"]\/clusters\/:clusterId['"]/.test(clusterRoutesContent);
    const hasCryptoGet = /router\.get\(['"]\/clusters\/:clusterId\/members\/crypto['"]/.test(clusterRoutesContent);
    if (hasClusterGet && hasCryptoGet) {
      recordResult('cluster_endpoints_preserved', true, 'GET /api/clusters/:clusterId and GET /api/clusters/:clusterId/members/crypto are intact');
    } else {
      recordResult('cluster_endpoints_preserved', false, `Cluster endpoints missing: clusterGet=${hasClusterGet}, cryptoGet=${hasCryptoGet}`);
    }

    // Test 9: Verify AccessManagementCard does not contain Specification section or ADK endpoint
    const hasAdkSpec = /adk_spec_get|category:\s*['"]Specification['"]/.test(accessMgmtContent);
    if (!hasAdkSpec) {
      recordResult('access_management_no_adk_spec', true, 'No Specification section or ADK endpoint in AccessManagementCard');
    } else {
      recordResult('access_management_no_adk_spec', false, 'Found Specification section or ADK endpoint in AccessManagementCard');
    }

    // Test 10: Verify AccessManagementCard does not contain connection_delete, cluster_create, cluster_member_eject, cluster_leave, cluster_member_role_patch
    const hasRemovedEndpoints = /connection_delete|cluster_create|cluster_member_eject|cluster_leave|cluster_member_role_patch/.test(accessMgmtContent);
    if (!hasRemovedEndpoints) {
      recordResult('access_management_no_removed_endpoints', true, 'Connection delete, cluster create/eject/leave, and member role patch removed from AccessManagementCard');
    } else {
      recordResult('access_management_no_removed_endpoints', false, 'Found removed connection or cluster endpoints in AccessManagementCard');
    }

  } catch (err: any) {
    recordResult('regression_suite_execution', false, err?.message || String(err));
  }

  return results;
}
