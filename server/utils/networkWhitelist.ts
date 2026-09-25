import net from 'net';
import { Request } from 'express';

function ipV4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

export function matchIPv4Cidr(clientIp: string, cidr: string): boolean {
  const parts = cidr.split('/');
  const rangeIp = parts[0];
  const prefixStr = parts[1];
  const prefix = prefixStr !== undefined ? parseInt(prefixStr, 10) : 32;
  if (prefix < 0 || prefix > 32) return false;
  if (!net.isIPv4(clientIp) || !net.isIPv4(rangeIp)) return false;

  const clientInt = ipV4ToInt(clientIp);
  const rangeInt = ipV4ToInt(rangeIp);
  const mask = prefix === 0 ? 0 :((-1 << (32 - prefix)) >>> 0);
  return (clientInt & mask) === (rangeInt & mask);
}

export function matchIPv6(clientIp: string, rule: string): boolean {
  if (rule.includes('/')) {
    const [baseIp, prefixStr] = rule.split('/');
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 128) return false;
    if (!net.isIPv6(clientIp) || !net.isIPv6(baseIp)) return false;
    if (prefix === 0) return true;

    const clientNorm = normalizeIPv6(clientIp);
    const baseNorm = normalizeIPv6(baseIp);

    if (prefix === 128) {
      return clientNorm.equals(baseNorm);
    }

    const fullBytes = Math.floor(prefix / 8);
    const remainingBits = prefix % 8;

    if (fullBytes > 0) {
      if (!clientNorm.subarray(0, fullBytes).equals(baseNorm.subarray(0, fullBytes))) {
        return false;
      }
    }

    if (remainingBits > 0) {
      const mask = (0xFF << (8 - remainingBits)) & 0xFF;
      if ((clientNorm[fullBytes] & mask) !== (baseNorm[fullBytes] & mask)) {
        return false;
      }
    }

    return true;
  } else {
    if (!net.isIPv6(clientIp) || !net.isIPv6(rule)) return false;
    return normalizeIPv6(clientIp).equals(normalizeIPv6(rule));
  }
}

function normalizeIPv6(ip: string): Buffer {
  let address = ip.toLowerCase();
  if (address.includes('::')) {
    const parts = address.split('::');
    const left = parts[0] ? parts[0].split(':').filter(Boolean) : [];
    const right = parts[1] ? parts[1].split(':').filter(Boolean) : [];
    const missing = 8 - (left.length + right.length);
    const zeros = Array(missing).fill('0');
    address = [...left, ...zeros, ...right].join(':');
  }
  const chunks = address.split(':').filter(Boolean);
  const buf = Buffer.alloc(16);
  chunks.forEach((part, idx) => {
    if (idx < 8) {
      buf.writeUInt16BE(parseInt(part || '0', 16), idx * 2);
    }
  });
  return buf;
}

export function validateAndNormalizeWhitelist(networks: any, clientIp?: string): string[] {
  if (networks === undefined || networks === null || (Array.isArray(networks) && networks.length === 0)) {
    return [];
  }

  if (!Array.isArray(networks)) {
    throw new Error('whitelisted_networks must be an array of IP addresses or CIDRs.');
  }
  if (networks.length > 50) {
    throw new Error('Too many whitelisted networks (maximum 50).');
  }

  const normalizedSet = new Set<string>();

  for (const item of networks) {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(`Invalid network entry: ${JSON.stringify(item)}. Must be a non-empty string.`);
    }
    const trimmed = item.trim();
    if (trimmed.includes('/')) {
      const [ip, prefixStr] = trimmed.split('/');
      const prefix = parseInt(prefixStr, 10);
      if (net.isIPv4(ip)) {
        if (isNaN(prefix) || prefix < 0 || prefix > 32) {
          throw new Error(`Invalid IPv4 CIDR prefix in: ${trimmed}. Must be between 0 and 32.`);
        }
        normalizedSet.add(`${ip}/${prefix}`);
      } else if (net.isIPv6(ip)) {
        if (isNaN(prefix) || prefix < 0 || prefix > 128) {
          throw new Error(`Invalid IPv6 CIDR prefix in: ${trimmed}. Must be between 0 and 128.`);
        }
        normalizedSet.add(`${ip.toLowerCase()}/${prefix}`);
      } else {
        throw new Error(`Invalid IP address in CIDR: ${trimmed}`);
      }
    } else {
      if (net.isIPv4(trimmed)) {
        normalizedSet.add(`${trimmed}/32`);
      } else if (net.isIPv6(trimmed)) {
        normalizedSet.add(`${trimmed.toLowerCase()}/128`);
      } else {
        throw new Error(`Invalid IP address or CIDR: ${trimmed}`);
      }
    }
  }

  const normalizedList = Array.from(normalizedSet).sort();

  if (clientIp && normalizedList.length > 0) {
    if (!isIpAllowed(clientIp, normalizedList)) {
      const err = new Error(`Current network ${clientIp} is not included in the provided whitelist. Registration rejected to prevent immediate account self-lockout. You must include your current IP address or network range.`);
      (err as any).code = 'SELF_LOCKOUT_PREVENTED';
      (err as any).statusCode = 400;
      throw err;
    }
  }

  return normalizedList;
}

export function isIpAllowed(clientIp: string, whitelistedNetworks: string[] | null | undefined): boolean {
  if (!whitelistedNetworks || !Array.isArray(whitelistedNetworks) || whitelistedNetworks.length === 0) {
    return true;
  }

  const normalizedClientIp = clientIp.startsWith('::ffff:') ? clientIp.substring(7) : clientIp;

  for (const rule of whitelistedNetworks) {
    if (rule.includes('/')) {
      const [ip] = rule.split('/');
      if (net.isIPv4(ip)) {
        if (net.isIPv4(normalizedClientIp) && matchIPv4Cidr(normalizedClientIp, rule)) {
          return true;
        }
      } else if (net.isIPv6(ip)) {
        if (net.isIPv6(normalizedClientIp) && matchIPv6(normalizedClientIp, rule)) {
          return true;
        }
      }
    } else {
      if (rule.toLowerCase() === normalizedClientIp.toLowerCase()) {
        return true;
      }
    }
  }

  return false;
}

/**
 * TRUSTED PROXY SAFETY MODEL:
 * In Cloud Run / Nginx / Cloudflare reverse proxy environments, Express is configured with
 * app.set('trust proxy', 1) (or equivalent topology). Express's internal proxy-addr algorithm
 * evaluates incoming socket connections and trusted hops, populating req.ip as the single
 * authoritative client IP.
 *
 * To prevent IP spoofing attacks where an untrusted client sends or prepends fake
 * X-Forwarded-For headers, we strictly rely on Express's evaluated req.ip.
 * If req.ip is absent (e.g., direct socket or mock request), we conservatively fall back to
 * req.socket.remoteAddress without trusting raw X-Forwarded-For headers.
 */
export function getClientIp(req: Request): string {
  let ip = '';

  if (req.ip && typeof req.ip === 'string' && req.ip.trim()) {
    ip = req.ip.trim();
  }

  if (!ip && req.socket?.remoteAddress) {
    ip = req.socket.remoteAddress;
  }

  if (!ip && (req as any).connection?.remoteAddress) {
    ip = (req as any).connection.remoteAddress;
  }

  if (!ip) {
    ip = '127.0.0.1';
  }

  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  return ip;
}
