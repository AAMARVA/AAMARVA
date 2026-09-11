import dns from 'dns';
import net from 'net';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);

/**
 * Checks if an IP address is private or reserved.
 * Implements strict blocking for private ranges (SSRF protection).
 */
export function isPrivateIP(ip: string): boolean {
  if (!ip) return true;
  
  // IPv4 Private Ranges
  // 10.0.0.0/8
  // 172.16.0.0/12
  // 192.168.0.0/16
  // 127.0.0.0/8 (Loopback)
  // 169.254.0.0/16 (Link-local)
  
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  
  if (net.isIPv6(ip)) {
    const lowerIp = ip.toLowerCase();
    // Loopback ::1
    if (lowerIp === '::1' || lowerIp === '0:0:0:0:0:0:0:1') return true;
    // Link-local fe80::/10
    if (lowerIp.startsWith('fe80')) return true;
    // Unique local fc00::/7
    if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) return true;
    // IPv4-mapped IPv6 ::ffff:127.0.0.1
    if (lowerIp.startsWith('::ffff:')) {
      const ipv4 = ip.split(':').pop();
      return ipv4 ? isPrivateIP(ipv4) : true;
    }
    // Unspecified ::
    if (lowerIp === '::' || lowerIp === '0:0:0:0:0:0:0:0') return true;
    return false;
  }
  
  return true;
}

/**
 * Validates a URL for SSRF protection and security compliance.
 * - Blocks private/internal destinations.
 * - Fails closed on DNS failure.
 * - Protects against IPv4-mapped IPv6 bypasses.
 * - Rejects invalid URLs.
 * - Rejects non-HTTPS in production.
 */
export async function validateSafeUrl(urlStr: string): Promise<{ safe: boolean; error?: string }> {
  try {
    const url = new URL(urlStr);
    
    // Production Security Requirement: Only HTTPS allowed
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      return { safe: false, error: 'SSRF Violation: Only HTTPS protocol is allowed in production environment.' };
    }
    
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { safe: false, error: `SSRF Violation: Unsupported protocol [${url.protocol}]. Only HTTP/HTTPS are allowed.` };
    }

    const host = url.hostname;
    if (!host) {
      return { safe: false, error: 'SSRF Violation: Invalid URL (missing hostname).' };
    }
    
    // If it's already an IP address, check it directly
    if (net.isIP(host)) {
      if (isPrivateIP(host)) {
        return { safe: false, error: `SSRF Violation: Destination IP [${host}] is a private or internal address.` };
      }
      return { safe: true };
    }
    
    // DNS Resolution check (Fail-closed)
    try {
      const ips: string[] = [];
      
      // Attempt IPv4 resolution
      try {
        const ipv4s = await resolve4(host);
        ips.push(...ipv4s);
      } catch (e) {
        // Not all hosts have IPv4
      }
      
      // Attempt IPv6 resolution
      try {
        const ipv6s = await resolve6(host);
        ips.push(...ipv6s);
      } catch (e) {
        // Not all hosts have IPv6
      }
      
      if (ips.length === 0) {
        return { safe: false, error: `SSRF Violation: DNS resolution failed for host [${host}]. Connection rejected (fail-closed).` };
      }
      
      // Check ALL resolved IPs for private address ranges
      for (const ip of ips) {
        if (isPrivateIP(ip)) {
          return { safe: false, error: `SSRF Violation: Host [${host}] resolved to a private/internal IP address [${ip}].` };
        }
      }
      
      return { safe: true };
    } catch (dnsErr: any) {
      return { safe: false, error: `SSRF Violation: DNS lookup error for [${host}]: ${dnsErr.message}` };
    }
  } catch (urlErr: any) {
    return { safe: false, error: 'SSRF Violation: Malformed or invalid URL string.' };
  }
}
