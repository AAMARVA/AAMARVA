import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { getSupabaseClient } from '../supabase';
import { applicationService } from '../services/applicationService';
import aamarvaRouter from '../routes/aamarvaRoutes';

export async function runEndpointWhitelistTests() {
  console.log('================================================================');
  console.log('STARTING RIGOROUS TESTS A THROUGH J FOR REGISTRATION WHITELIST');
  console.log('================================================================\n');

  const app = express();
  app.use(cors());
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', aamarvaRouter);

  // Start temporary test server
  const server = app.listen(3099);
  const baseUrl = 'http://127.0.0.1:3099/api';
  const adminSecret = process.env.JWT_SECRET || 'aamarva-admin-super-key-2026';
  const adminToken = jwt.sign({ role: 'admin_operator' }, adminSecret, { expiresIn: '1h' });

  const sb = getSupabaseClient();
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (name: string, passed: boolean, reason?: string) => {
    results[name] = { status: passed ? 'PASSED' : 'FAILED', reason };
    console.log(`[${passed ? 'PASSED' : 'FAILED'}] ${name}${reason ? ` -> ${reason}` : ''}`);
  };

  const cleanupEmails: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupAppIds: string[] = [];

  try {
    // -------------------------------------------------------------
    // TEST A: Non-whitelisted email → POST /api/auth/register returns 403
    // -------------------------------------------------------------
    const emailA = `test-a-non-whitelisted-${Date.now()}@example.com`;
    const resA = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailA,
        password: 'TestPassword123!@#',
        agentName: 'Agent A'
      })
    });
    const bodyA = await resA.json();
    const testAPassed = resA.status === 403 && bodyA?.error?.message?.includes('not whitelisted');
    recordResult('A. Non-whitelisted email -> POST /api/auth/register returns 403', testAPassed, `HTTP ${resA.status}: ${bodyA?.error?.message}`);

    // -------------------------------------------------------------
    // TEST B: Whitelisted email → registration proceeds normally
    // -------------------------------------------------------------
    const emailB = `test-b-whitelisted-${Date.now()}@example.com`;
    cleanupEmails.push(emailB);
    await applicationService.addEmailToWhitelist(emailB);

    const resB = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailB,
        password: 'TestPassword123!@#',
        agentName: 'Agent B'
      })
    });
    const bodyB = await resB.json();
    if (bodyB?.data?.user?.id) cleanupUserIds.push(bodyB.data.user.id);
    const testBPassed = resB.status === 201 && Boolean(bodyB?.data?.apiKey) && Boolean(bodyB?.data?.agentId);
    recordResult('B. Whitelisted email -> registration proceeds normally', testBPassed, `HTTP ${resB.status}, Agent: ${bodyB?.data?.agentId}`);

    // -------------------------------------------------------------
    // TEST C: Instrument/mock isEmailWhitelisted and prove POST /api/auth/register invokes it exactly ONCE
    // -------------------------------------------------------------
    const emailC = `test-c-single-check-${Date.now()}@example.com`;
    cleanupEmails.push(emailC);
    await applicationService.addEmailToWhitelist(emailC);

    let checkCountC = 0;
    const origIsWhitelistedC = applicationService.isEmailWhitelisted;
    applicationService.isEmailWhitelisted = async (e: string) => {
      if (e.toLowerCase().trim() === emailC.toLowerCase().trim()) {
        checkCountC++;
      }
      return origIsWhitelistedC.call(applicationService, e);
    };

    const resC = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailC,
        password: 'TestPassword123!@#',
        agentName: 'Agent C'
      })
    });
    const bodyC = await resC.json();
    applicationService.isEmailWhitelisted = origIsWhitelistedC; // restore
    if (bodyC?.data?.user?.id) cleanupUserIds.push(bodyC.data.user.id);

    const testCPassed = resC.status === 201 && checkCountC === 1;
    recordResult('C. Prove POST /api/auth/register invokes isEmailWhitelisted exactly ONCE', testCPassed, `Status ${resC.status}, Invoked ${checkCountC} time(s). Body: ${JSON.stringify(bodyC)}`);

    // -------------------------------------------------------------
    // TEST D: Manual whitelist → verify row exists in Supabase
    // -------------------------------------------------------------
    const emailD = `test-d-manual-${Date.now()}@example.com`;
    cleanupEmails.push(emailD);
    const resD = await fetch(`${baseUrl}/applications/admin/whitelist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ email: emailD })
    });
    const bodyD = await resD.json();

    const { data: dbCheckD } = await sb
      .from('registration_whitelist')
      .select('id, email')
      .ilike('email', emailD);

    const testDPassed = resD.status === 200 && bodyD.success === true && dbCheckD?.length === 1;
    recordResult('D. Manual whitelist -> verify row exists in Supabase', testDPassed, `Supabase rows: ${dbCheckD?.length}`);

    // -------------------------------------------------------------
    // TEST E: Approved application → verify row exists in Supabase and application becomes Approved
    // -------------------------------------------------------------
    const emailE = `test-e-app-${Date.now()}@example.com`;
    cleanupEmails.push(emailE);
    const appRecordE = await applicationService.saveApplication({
      fullName: 'Applicant E',
      emailAddress: emailE,
      githubProfile: 'https://github.com/applicant-e',
      linkedinProfile: '',
      bestDescribes: 'AI Engineer',
      operatingAgent: 'Yes',
      agentName: 'AgentE',
      agentUrl: '',
      agentDetails: 'Test E',
      agentStage: 'Beta',
      agentFrameworks: [],
      agentOperateLocation: 'Cloud',
      devEnvironment: 'TypeScript',
      devEnvironmentOther: '',
      languages: [],
      languagesOther: '',
      modelProviders: [],
      modelProvidersOther: '',
      usesExternalTools: 'No',
      communicatesWithAgents: 'No',
      communicationDetails: '',
      hopeToAccomplish: 'Testing',
      agentUsePurpose: 'Testing',
      discoverCapability: 'Testing',
      discoveryProblems: 'Testing',
      contributions: [],
      contributionsOther: '',
      first30Days: 'Testing',
      additionalNotes: ''
    });
    cleanupAppIds.push(appRecordE.id);

    const resE = await fetch(`${baseUrl}/applications/admin/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ id: appRecordE.id })
    });
    const bodyE = await resE.json();

    const { data: dbCheckE } = await sb
      .from('registration_whitelist')
      .select('id, email')
      .ilike('email', emailE);

    const { data: appDbE } = await sb
      .from('applications')
      .select('id, status')
      .eq('id', appRecordE.id)
      .maybeSingle();

    const testEPassed = resE.status === 200 && bodyE.success === true && dbCheckE?.length === 1 && appDbE?.status === 'Approved';
    recordResult('E. Approved application -> verify row exists in Supabase and application becomes Approved', testEPassed, `Whitelist rows: ${dbCheckE?.length}, Status: ${appDbE?.status}`);

    // -------------------------------------------------------------
    // TEST F: Manually whitelisted email + subsequently declined application → whitelist remains
    // -------------------------------------------------------------
    const emailF = `test-f-shared-${Date.now()}@example.com`;
    cleanupEmails.push(emailF);
    // 1. Manually whitelist email
    await applicationService.addEmailToWhitelist(emailF);

    // 2. Submit a pending intake application with that same email
    const pendingAppF = await applicationService.saveApplication({
      fullName: 'Applicant F',
      emailAddress: emailF,
      githubProfile: '',
      linkedinProfile: '',
      bestDescribes: 'Developer',
      operatingAgent: 'No',
      agentName: 'BotF',
      agentUrl: '',
      agentDetails: 'Pending app',
      agentStage: 'Idea',
      agentFrameworks: [],
      agentOperateLocation: 'Local',
      devEnvironment: 'VS Code',
      devEnvironmentOther: '',
      languages: [],
      languagesOther: '',
      modelProviders: [],
      modelProvidersOther: '',
      usesExternalTools: 'No',
      communicatesWithAgents: 'No',
      communicationDetails: '',
      hopeToAccomplish: 'Testing',
      agentUsePurpose: 'Testing',
      discoverCapability: 'Testing',
      discoveryProblems: 'Testing',
      contributions: [],
      contributionsOther: '',
      first30Days: 'Testing',
      additionalNotes: ''
    });
    cleanupAppIds.push(pendingAppF.id);

    // 3. Decline the application
    await fetch(`${baseUrl}/applications/admin/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ id: pendingAppF.id })
    });

    // 4. Verify whitelist row STILL exists in Supabase
    const { data: dbCheckF } = await sb
      .from('registration_whitelist')
      .select('id, email')
      .ilike('email', emailF);

    const testFPassed = dbCheckF && dbCheckF.length === 1;
    recordResult('F. Manually whitelisted email + subsequently declined application -> whitelist remains', testFPassed, `Supabase whitelist rows: ${dbCheckF?.length}`);

    // -------------------------------------------------------------
    // TEST G: Directly delete an email from Supabase registration_whitelist and verify registration is rejected
    // -------------------------------------------------------------
    const emailG = `test-g-delete-${Date.now()}@example.com`;
    cleanupEmails.push(emailG);
    // Insert into DB
    await sb.from('registration_whitelist').insert({ email: emailG });
    // Directly delete from DB
    await sb.from('registration_whitelist').delete().ilike('email', emailG);

    // Attempt registration
    const resG = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailG,
        password: 'Password123!@#',
        agentName: 'Agent G'
      })
    });
    const bodyG = await resG.json();
    const testGPassed = resG.status === 403 && bodyG?.error?.message?.includes('not whitelisted');
    recordResult('G. Directly delete email from Supabase -> verify registration is rejected', testGPassed, `HTTP ${resG.status}: ${bodyG?.error?.message}`);

    // -------------------------------------------------------------
    // TEST H: Directly insert an email into Supabase registration_whitelist and verify registration is accepted
    // -------------------------------------------------------------
    const emailH = `test-h-insert-${Date.now()}@example.com`;
    cleanupEmails.push(emailH);
    // Directly insert into DB bypassing applicationService
    await sb.from('registration_whitelist').insert({ email: emailH });

    // Attempt registration
    const resH = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailH,
        password: 'Password123!@#',
        agentName: 'Agent H'
      })
    });
    const bodyH = await resH.json();
    if (bodyH?.data?.user?.id) cleanupUserIds.push(bodyH.data.user.id);
    const testHPassed = resH.status === 201 && Boolean(bodyH?.data?.apiKey);
    recordResult('H. Directly insert email into Supabase -> verify registration is accepted', testHPassed, `HTTP ${resH.status}, Agent: ${bodyH?.data?.agentId}`);

    // -------------------------------------------------------------
    // TEST I: Verify there is no whitelist.json/local-cache fallback
    // -------------------------------------------------------------
    const whitelistFilePath = path.join(process.cwd(), 'server', 'data', 'whitelist.json');
    const fileDoesNotExist = !fs.existsSync(whitelistFilePath);
    const noMemoryCache = (applicationService as any).whitelistCache === undefined;

    const ghostEmail = `test-i-ghost-${Date.now()}@example.com`;
    const isGhostWhitelisted = await applicationService.isEmailWhitelisted(ghostEmail);
    const testIPassed = fileDoesNotExist && noMemoryCache && isGhostWhitelisted === false;
    recordResult('I. Verify there is no whitelist.json/local-cache fallback', testIPassed, `File absent: ${fileDoesNotExist}, Cache absent: ${noMemoryCache}, Ghost email rejected: ${isGhostWhitelisted === false}`);

    // -------------------------------------------------------------
    // TEST J: Verify there is no frontend /check-whitelist request
    // -------------------------------------------------------------
    const modalSrcPath = path.join(process.cwd(), 'src', 'components', 'FloorRegistrationModal.tsx');
    const modalSrc = fs.readFileSync(modalSrcPath, 'utf-8');
    const frontendNoCheck = !modalSrc.includes('check-whitelist');

    // Also verify endpoint does not exist on server (returns 404)
    const resJ = await fetch(`${baseUrl}/applications/check-whitelist?email=test@example.com`);
    const serverNoCheck = resJ.status === 404;

    const testJPassed = frontendNoCheck && serverNoCheck;
    recordResult('J. Verify there is no frontend /check-whitelist request or endpoint', testJPassed, `Frontend free of check-whitelist: ${frontendNoCheck}, Endpoint returns 404: ${serverNoCheck}`);

  } catch (err: any) {
    console.error('Fatal error during E2E endpoint tests:', err);
  } finally {
    console.log('\nCleaning up E2E test records from Supabase...');
    for (const email of cleanupEmails) {
      try {
        await sb.from('registration_whitelist').delete().ilike('email', email);
      } catch (e) {}
    }
    for (const uid of cleanupUserIds) {
      try {
        await sb.from('users').delete().eq('id', uid);
        if (sb.auth?.admin?.deleteUser) {
          await sb.auth.admin.deleteUser(uid);
        }
      } catch (e) {}
    }
    for (const appId of cleanupAppIds) {
      try {
        await sb.from('applications').delete().eq('id', appId);
      } catch (e) {}
    }
    server.close();
    console.log('E2E Cleanup completed.\n');
  }

  console.log('================================================================');
  console.log('RIGOROUS TESTS A THROUGH J RESULTS:');
  console.log('================================================================');
  console.table(results);

  const allPassed = Object.values(results).every(r => r.status === 'PASSED');
  console.log(`\nOverall Status: ${allPassed ? 'ALL TESTS A-J PASSED' : 'SOME TESTS FAILED'}\n`);
  return allPassed;
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('endpointWhitelistTests')) {
  runEndpointWhitelistTests().then(allPassed => {
    process.exit(allPassed ? 0 : 1);
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
