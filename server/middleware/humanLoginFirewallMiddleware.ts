import { Request, Response, NextFunction } from 'express';
import net from 'net';
import { getClientIp, matchIPv4Cidr, matchIPv6 } from '../utils/networkWhitelist';

/**
 * DATACENTER, CLOUD NETWORK, AND HOSTING PROVIDER CIDR RANGES
 * Includes major cloud providers: AWS, GCP, Azure, DigitalOcean, Hetzner,
 * Linode/Akamai, OVH, Vultr, Cloudflare/Fastly CDNs, Oracle Cloud, Alibaba Cloud, etc.
 */
export const DATACENTER_CIDR_RANGES: string[] = [
  // Amazon Web Services (AWS)
  '3.0.0.0/8',
  '13.0.0.0/8',
  '15.0.0.0/8',
  '18.0.0.0/8',
  '34.192.0.0/10',
  '35.160.0.0/11',
  '52.0.0.0/8',
  '54.0.0.0/8',
  '99.77.0.0/16',
  '100.20.0.0/14',
  '107.20.0.0/14',
  '174.129.0.0/16',
  '184.72.0.0/15',
  '204.236.0.0/15',

  // Google Cloud Platform (GCP)
  '34.64.0.0/10',
  '35.184.0.0/13',
  '35.192.0.0/11',
  '35.224.0.0/11',
  '34.120.0.0/12',
  '34.140.0.0/12',
  '104.154.0.0/15',
  '104.196.0.0/14',
  '130.211.0.0/16',
  '146.148.0.0/17',
  '173.255.112.0/20',
  '208.117.224.0/19',
  '35.200.0.0/13',

  // Microsoft Azure
  '13.64.0.0/11',
  '13.96.0.0/13',
  '20.33.0.0/12',
  '20.180.0.0/12',
  '40.74.0.0/15',
  '40.112.0.0/13',
  '51.140.0.0/14',
  '52.136.0.0/13',
  '104.40.0.0/13',
  '137.116.0.0/15',
  '168.61.0.0/16',
  '191.232.0.0/13',

  // DigitalOcean
  '45.55.0.0/16',
  '104.131.0.0/16',
  '104.236.0.0/16',
  '138.68.0.0/16',
  '138.197.0.0/16',
  '159.203.0.0/16',
  '159.65.0.0/16',
  '165.227.0.0/16',
  '167.99.0.0/16',
  '178.62.0.0/16',
  '188.166.0.0/16',
  '198.199.0.0/16',
  '206.189.0.0/16',

  // Hetzner
  '78.46.0.0/15',
  '88.198.0.0/16',
  '94.130.0.0/16',
  '116.202.0.0/15',
  '135.181.0.0/16',
  '136.243.0.0/16',
  '144.76.0.0/16',
  '148.251.0.0/16',
  '159.69.0.0/16',
  '162.55.0.0/16',
  '168.119.0.0/16',
  '176.9.0.0/16',
  '178.63.0.0/16',
  '188.40.0.0/16',
  '195.201.0.0/16',
  '213.133.0.0/16',
  '213.239.0.0/16',

  // Linode / Akamai
  '45.33.0.0/16',
  '45.56.0.0/16',
  '45.79.0.0/16',
  '50.116.0.0/16',
  '96.126.0.0/16',
  '139.162.0.0/16',
  '172.104.0.0/16',
  '173.255.192.0/18',
  '192.155.80.0/20',
  '198.58.96.0/19',
  '209.208.0.0/17',
  '212.71.224.0/19',
  '170.187.0.0/16',

  // OVH Cloud
  '51.254.0.0/15',
  '51.68.0.0/14',
  '54.36.0.0/15',
  '91.121.0.0/16',
  '92.222.0.0/16',
  '137.74.0.0/16',
  '142.4.192.0/18',
  '149.56.0.0/16',
  '151.80.0.0/16',
  '167.114.0.0/16',
  '178.32.0.0/15',
  '188.165.0.0/16',
  '198.27.64.0/18',
  '198.50.128.0/17',
  '213.186.32.0/19',
  '213.251.128.0/18',
  '51.75.0.0/14',
  '51.89.0.0/16',
  '51.178.0.0/15',
  '51.210.0.0/15',

  // Vultr
  '45.32.0.0/16',
  '45.63.0.0/16',
  '45.76.0.0/16',
  '45.77.0.0/16',
  '66.42.0.0/16',
  '108.61.0.0/16',
  '136.244.0.0/16',
  '140.82.0.0/16',
  '144.202.0.0/16',
  '149.28.0.0/16',
  '155.138.0.0/16',
  '207.148.0.0/16',
  '208.167.240.0/20',
  '216.238.64.0/18',
  '217.69.0.0/16',

  // Cloudflare / Fastly Datacenter Ranges
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '108.162.192.0/18',
  '131.0.72.0/22',
  '141.101.64.0/18',
  '162.158.0.0/15',
  '172.64.0.0/13',
  '173.245.48.0/20',
  '188.114.96.0/20',
  '190.93.240.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',

  // Oracle Cloud
  '129.146.0.0/15',
  '129.150.0.0/15',
  '129.213.0.0/16',
  '130.35.0.0/16',
  '130.61.0.0/16',
  '132.145.0.0/16',
  '134.70.0.0/16',
  '140.238.0.0/15',
  '147.154.0.0/16',
  '150.136.0.0/16',
  '152.67.0.0/16',
  '152.70.0.0/16',
  '158.101.0.0/16',
  '192.29.0.0/16',
  '193.122.0.0/15',

  // Alibaba Cloud
  '47.52.0.0/16',
  '47.74.0.0/15',
  '47.88.0.0/14',
  '47.91.0.0/16',
  '47.240.0.0/14',
  '149.129.0.0/16',
  '161.117.0.0/16',
  '198.11.160.0/19',
];

/**
 * Extract client IP address for firewall inspection.
 * Supports simulation/testing headers (`x-simulated-ip`, `x-client-ip`).
 */
export function extractClientIpForFirewall(req: Request): string {
  const simulatedIp = req.headers['x-simulated-ip'] as string;
  if (simulatedIp && typeof simulatedIp === 'string' && simulatedIp.trim()) {
    let clean = simulatedIp.trim();
    if (clean.startsWith('::ffff:')) clean = clean.substring(7);
    return clean;
  }

  const clientIpHeader = req.headers['x-client-ip'] as string;
  if (clientIpHeader && typeof clientIpHeader === 'string' && clientIpHeader.trim()) {
    let clean = clientIpHeader.split(',')[0].trim();
    if (clean.startsWith('::ffff:')) clean = clean.substring(7);
    return clean;
  }

  return getClientIp(req);
}

/**
 * Determines whether an IP originates from a hosting provider, cloud network, or datacenter.
 */
export function isDatacenterOrHostingIP(clientIp: string, req?: Request): boolean {
  if (req) {
    // Explicit header flags for testing or reverse proxies
    const datacenterHeader = (req.headers['x-datacenter-ip'] as string || '').toLowerCase();
    if (datacenterHeader === 'true' || datacenterHeader === '1') {
      return true;
    }

    const ipTypeHeader = (req.headers['x-ip-type'] as string || req.headers['x-network-type'] as string || '').toLowerCase();
    if (['datacenter', 'hosting', 'cloud'].includes(ipTypeHeader)) {
      return true;
    }

    const clientOrg = (req.headers['x-client-org'] as string || req.headers['x-asn-org'] as string || '').toLowerCase();
    const datacenterKeywords = [
      'amazon', 'aws', 'google cloud', 'gcp', 'azure', 'digitalocean', 'hetzner',
      'linode', 'ovh', 'vultr', 'datacenter', 'hosting', 'cloud', 'rackspace',
      'leaseweb', 'contabo', 'fastly', 'cloudflare'
    ];
    if (clientOrg && datacenterKeywords.some(kw => clientOrg.includes(kw))) {
      return true;
    }
  }

  const cleanIp = clientIp.startsWith('::ffff:') ? clientIp.substring(7) : clientIp;

  // Check against known datacenter/cloud CIDR blocks
  for (const cidr of DATACENTER_CIDR_RANGES) {
    const [baseIp] = cidr.split('/');
    if (net.isIPv4(baseIp) && net.isIPv4(cleanIp)) {
      if (matchIPv4Cidr(cleanIp, cidr)) {
        return true;
      }
    } else if (net.isIPv6(baseIp) && net.isIPv6(cleanIp)) {
      if (matchIPv6(cleanIp, cidr)) {
        return true;
      }
    }
  }

  return false;
}

export type DeviceCategory = 'desktop' | 'mobile' | 'tablet' | 'tv' | 'console' | 'wearable' | 'bot' | 'unrecognized';

/**
 * Detects device type based on User-Agent string and Client Hint headers.
 */
export function detectDeviceType(req: Request): DeviceCategory {
  // Allow test header override
  const overrideDevice = req.headers['x-device-type'] as string;
  if (overrideDevice) {
    const normalized = overrideDevice.toLowerCase().trim();
    if (['desktop', 'mobile', 'tablet', 'tv', 'console', 'wearable', 'bot', 'unrecognized'].includes(normalized)) {
      return normalized as DeviceCategory;
    }
  }

  const userAgentHeader = (req.headers['x-user-agent'] || req.headers['user-agent'] || '') as string;
  const userAgent = userAgentHeader.trim();

  if (!userAgent) {
    return 'unrecognized';
  }

  const ua = userAgent.toLowerCase();

  // 1. Check for Bots, Scrapers, Crawlers, and Automation/HTTP tools
  const botKeywords = [
    'bot', 'crawler', 'spider', 'scraper', 'curl/', 'wget/', 'python-requests', 'python-urllib',
    'axios', 'node-fetch', 'postmanruntime', 'insomnia', 'go-http-client', 'java/',
    'apache-httpclient', 'headlesschrome', 'phantomjs', 'puppeteer', 'selenium', 'playwright',
    'scrapy', 'httpx', 'rest-client', 'urllib'
  ];
  if (botKeywords.some(keyword => ua.includes(keyword))) {
    return 'bot';
  }

  // 2. Check for Smart TVs
  const tvKeywords = [
    'smarttv', 'smart-tv', 'hbbtv', 'appletv', 'roku', 'tizen', 'vizio', 'vidaa',
    'googletv', 'firetv', 'nettv', 'chromecast'
  ];
  if (tvKeywords.some(keyword => ua.includes(keyword))) {
    return 'tv';
  }

  // 3. Check for Game Consoles
  const consoleKeywords = ['playstation', 'xbox', 'nintendo'];
  if (consoleKeywords.some(keyword => ua.includes(keyword))) {
    return 'console';
  }

  // 4. Check for Wearables
  const wearableKeywords = ['apple watch', 'watchos', 'wear os', 'galaxy watch'];
  if (wearableKeywords.some(keyword => ua.includes(keyword))) {
    return 'wearable';
  }

  // Client Hints headers
  const secChUaMobile = req.headers['sec-ch-ua-mobile'];
  const secChUaPlatform = (req.headers['sec-ch-ua-platform'] as string || '').toLowerCase().replace(/"/g, '');

  // 5. Check Tablet
  const isTablet =
    ua.includes('ipad') ||
    ua.includes('tablet') ||
    ua.includes('playbook') ||
    ua.includes('kindle') ||
    ua.includes('silk') ||
    ua.includes('nexus 7') ||
    ua.includes('nexus 9') ||
    ua.includes('nexus 10') ||
    ua.includes('xoom') ||
    ua.includes('galaxy tab') ||
    ua.includes('sm-t') ||
    (ua.includes('android') && !ua.includes('mobile'));

  if (isTablet) {
    return 'tablet';
  }

  // 6. Check Mobile
  const isMobile =
    secChUaMobile === '?1' ||
    ua.includes('iphone') ||
    ua.includes('ipod') ||
    (ua.includes('android') && ua.includes('mobile')) ||
    ua.includes('blackberry') ||
    ua.includes('windows phone') ||
    ua.includes('opera mini') ||
    ua.includes('opera mobi') ||
    ua.includes('mobile safari') ||
    ua.includes('samsungbrowser') ||
    ua.includes('mobile;');

  if (isMobile) {
    return 'mobile';
  }

  // 7. Check Desktop
  const isDesktopOs =
    ua.includes('windows nt') ||
    ua.includes('macintosh') ||
    ua.includes('mac os x') ||
    ua.includes('linux x86_64') ||
    ua.includes('linux i686') ||
    ua.includes('cros') ||
    ua.includes('freebsd') ||
    ua.includes('openbsd') ||
    ['windows', 'macos', 'linux', 'chrome os'].some(p => secChUaPlatform.includes(p));

  const isStandardBrowser =
    ua.includes('chrome') ||
    ua.includes('safari') ||
    ua.includes('firefox') ||
    ua.includes('edg/') ||
    ua.includes('edge/') ||
    ua.includes('opera') ||
    ua.includes('brave');

  if (isDesktopOs || isStandardBrowser) {
    return 'desktop';
  }

  return 'unrecognized';
}

/**
 * Valid user devices allowed for human login: desktop, mobile, tablet.
 */
export function isAllowedUserDevice(deviceType: DeviceCategory): boolean {
  return ['desktop', 'mobile', 'tablet'].includes(deviceType);
}

export interface FirewallEvaluationResult {
  blocked: boolean;
  reason?: string;
  code?: string;
  details?: {
    ip: string;
    isDatacenter: boolean;
    deviceType: DeviceCategory;
    isValidDevice: boolean;
  };
}

/**
 * Evaluates the human login firewall rule against incoming request.
 * Rule:
 * Blocks request if it meets EITHER condition:
 * 1) Incoming IP address originates from a hosting provider, cloud network, or datacenter.
 * 2) Device type is NOT recognized as a desktop, mobile, or tablet.
 */
export function evaluateHumanLoginFirewall(req: Request): FirewallEvaluationResult {
  const clientIp = extractClientIpForFirewall(req);
  const isDatacenter = isDatacenterOrHostingIP(clientIp, req);
  const deviceType = detectDeviceType(req);
  const isValidDevice = isAllowedUserDevice(deviceType);

  if (isDatacenter) {
    return {
      blocked: true,
      reason: 'Access denied: Requests originating from hosting providers, cloud networks, or datacenters are not allowed for human login. Only real residential or cellular networks are permitted.',
      code: 'FIREWALL_BLOCKED_DATACENTER_IP',
      details: {
        ip: clientIp,
        isDatacenter: true,
        deviceType,
        isValidDevice,
      }
    };
  }

  if (!isValidDevice) {
    return {
      blocked: true,
      reason: `Access denied: Device type '${deviceType}' is not recognized as a standard user device (desktop, mobile, or tablet).`,
      code: 'FIREWALL_BLOCKED_UNRECOGNIZED_DEVICE',
      details: {
        ip: clientIp,
        isDatacenter: false,
        deviceType,
        isValidDevice: false,
      }
    };
  }

  return {
    blocked: false,
    details: {
      ip: clientIp,
      isDatacenter: false,
      deviceType,
      isValidDevice: true,
    }
  };
}

/**
 * Express Middleware enforcing the human login firewall rule.
 */
export function humanLoginFirewall(req: Request, res: Response, next: NextFunction) {
  const evaluation = evaluateHumanLoginFirewall(req);

  if (evaluation.blocked) {
    console.warn(`[HUMAN LOGIN FIREWALL BLOCKED] Code: ${evaluation.code} | Reason: ${evaluation.reason} | IP: ${evaluation.details?.ip} | Device: ${evaluation.details?.deviceType}`);
    return res.status(403).json({
      success: false,
      error: {
        code: evaluation.code || 'FIREWALL_BLOCKED',
        message: evaluation.reason || 'Access denied by human login firewall policy.',
        details: evaluation.details,
      }
    });
  }

  next();
}
