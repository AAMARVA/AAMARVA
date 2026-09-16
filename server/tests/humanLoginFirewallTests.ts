import { Request } from 'express';
import {
  evaluateHumanLoginFirewall,
  isDatacenterOrHostingIP,
  detectDeviceType,
  isAllowedUserDevice,
  DATACENTER_CIDR_RANGES,
} from '../middleware/humanLoginFirewallMiddleware';

/**
 * HUMAN LOGIN FIREWALL RULE VERIFICATION TEST SUITE
 */
export function runHumanLoginFirewallTests() {
  console.log('--- HUMAN LOGIN FIREWALL RULE AUDIT ---');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // 1. Test Datacenter IP Detection
  const awsIp = '3.5.10.20'; // In AWS 3.0.0.0/8
  const gcpIp = '34.65.1.2'; // In GCP 34.64.0.0/10
  const digitalOceanIp = '159.65.12.34'; // In DigitalOcean 159.65.0.0/16
  const residentialIp = '73.189.20.15'; // Typical Comcast Residential IP
  const mobileCellularIp = '172.56.21.99'; // Typical T-Mobile Cellular IP

  assert(isDatacenterOrHostingIP(awsIp) === true, 'AWS IP identified as datacenter IP');
  assert(isDatacenterOrHostingIP(gcpIp) === true, 'GCP IP identified as datacenter IP');
  assert(isDatacenterOrHostingIP(digitalOceanIp) === true, 'DigitalOcean IP identified as datacenter IP');
  assert(isDatacenterOrHostingIP(residentialIp) === false, 'Residential IP NOT marked as datacenter');
  assert(isDatacenterOrHostingIP(mobileCellularIp) === false, 'Cellular IP NOT marked as datacenter');

  // Header simulation test
  const reqWithDatacenterHeader = {
    headers: { 'x-datacenter-ip': 'true' }
  } as unknown as Request;
  assert(isDatacenterOrHostingIP(residentialIp, reqWithDatacenterHeader) === true, 'x-datacenter-ip header forces datacenter detection');

  // 2. Test Device Detection
  const desktopChromeUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const desktopMacSafariUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
  const iphoneMobileUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
  const androidMobileUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36';
  const ipadTabletUa = 'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';

  // Unrecognized / Blocked Device UAs
  const pythonBotUa = 'python-requests/2.31.0';
  const curlUa = 'curl/7.88.1';
  const postmanUa = 'PostmanRuntime/7.36.0';
  const headlessChromeUa = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36';
  const smartTvUa = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 2021 TV Safari/537.36';
  const playstationConsoleUa = 'Mozilla/5.0 (PlayStation 5 7.00) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Safari/605.1.15';
  const emptyUa = '';

  const mockReq = (ua: string, headers: Record<string, string> = {}) => ({
    headers: { 'user-agent': ua, ...headers }
  }) as unknown as Request;

  assert(detectDeviceType(mockReq(desktopChromeUa)) === 'desktop', 'Desktop Chrome detected as desktop');
  assert(detectDeviceType(mockReq(desktopMacSafariUa)) === 'desktop', 'Desktop Safari detected as desktop');
  assert(detectDeviceType(mockReq(iphoneMobileUa)) === 'mobile', 'iPhone detected as mobile');
  assert(detectDeviceType(mockReq(androidMobileUa)) === 'mobile', 'Android Mobile detected as mobile');
  assert(detectDeviceType(mockReq(ipadTabletUa)) === 'tablet', 'iPad detected as tablet');

  assert(detectDeviceType(mockReq(pythonBotUa)) === 'bot', 'Python requests detected as bot');
  assert(detectDeviceType(mockReq(curlUa)) === 'bot', 'curl detected as bot');
  assert(detectDeviceType(mockReq(postmanUa)) === 'bot', 'Postman detected as bot');
  assert(detectDeviceType(mockReq(headlessChromeUa)) === 'bot', 'Headless Chrome detected as bot');
  assert(detectDeviceType(mockReq(smartTvUa)) === 'tv', 'Smart TV detected as tv');
  assert(detectDeviceType(mockReq(playstationConsoleUa)) === 'console', 'PlayStation detected as console');
  assert(detectDeviceType(mockReq(emptyUa)) === 'unrecognized', 'Empty UA detected as unrecognized');

  // Allowed device types check
  assert(isAllowedUserDevice('desktop') === true, 'Desktop is allowed user device');
  assert(isAllowedUserDevice('mobile') === true, 'Mobile is allowed user device');
  assert(isAllowedUserDevice('tablet') === true, 'Tablet is allowed user device');
  assert(isAllowedUserDevice('bot') === false, 'Bot is NOT allowed user device');
  assert(isAllowedUserDevice('tv') === false, 'TV is NOT allowed user device');
  assert(isAllowedUserDevice('console') === false, 'Console is NOT allowed user device');
  assert(isAllowedUserDevice('unrecognized') === false, 'Unrecognized is NOT allowed user device');

  // 3. Complete Firewall Rule Evaluation Tests
  // Scenario A: Valid Residential IP + Valid Desktop Browser -> ALLOWED
  const evalValidHuman = evaluateHumanLoginFirewall({
    headers: {
      'x-simulated-ip': residentialIp,
      'user-agent': desktopChromeUa,
    }
  } as unknown as Request);
  assert(evalValidHuman.blocked === false, 'Valid residential IP + Desktop browser is ALLOWED');

  // Scenario B: Datacenter IP + Valid Desktop Browser -> BLOCKED (Condition 1 triggered)
  const evalDatacenterIp = evaluateHumanLoginFirewall({
    headers: {
      'x-simulated-ip': awsIp,
      'user-agent': desktopChromeUa,
    }
  } as unknown as Request);
  assert(evalDatacenterIp.blocked === true, 'Datacenter IP + Desktop browser is BLOCKED (Condition 1)');
  assert(evalDatacenterIp.code === 'FIREWALL_BLOCKED_DATACENTER_IP', 'Correct error code for datacenter IP');

  // Scenario C: Valid Residential IP + Python Bot / curl -> BLOCKED (Condition 2 triggered)
  const evalBotReq = evaluateHumanLoginFirewall({
    headers: {
      'x-simulated-ip': residentialIp,
      'user-agent': pythonBotUa,
    }
  } as unknown as Request);
  assert(evalBotReq.blocked === true, 'Residential IP + Bot User-Agent is BLOCKED (Condition 2)');
  assert(evalBotReq.code === 'FIREWALL_BLOCKED_UNRECOGNIZED_DEVICE', 'Correct error code for unrecognized device');

  // Scenario D: Valid Residential IP + Smart TV -> BLOCKED (Condition 2 triggered)
  const evalTvReq = evaluateHumanLoginFirewall({
    headers: {
      'x-simulated-ip': residentialIp,
      'user-agent': smartTvUa,
    }
  } as unknown as Request);
  assert(evalTvReq.blocked === true, 'Residential IP + Smart TV User-Agent is BLOCKED (Condition 2)');

  console.log(`\nFIREWALL RULE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED.`);
  return { passed, failed };
}

runHumanLoginFirewallTests();

