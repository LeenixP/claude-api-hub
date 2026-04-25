import { resolve4, resolve6 } from 'node:dns/promises';

const DNS_CACHE_TTL = 120_000; // 120 seconds
const dnsCache: Map<string, { safe: boolean; expires: number }> = new Map();

export function clearDnsCache(): void {
  dnsCache.clear();
}

const PRIVATE_RANGES = [
  // IPv4 RFC1918
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  // IPv4 loopback
  { start: '127.0.0.0', end: '127.255.255.255' },
  // IPv4 link-local
  { start: '169.254.0.0', end: '169.254.255.255' },
  // IPv4 broadcast
  { start: '0.0.0.0', end: '0.255.255.255' },
];

function ipToNum(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const num = ipToNum(ip);
  return PRIVATE_RANGES.some(range => {
    const start = ipToNum(range.start);
    const end = ipToNum(range.end);
    return num >= start && num <= end;
  });
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80') || lower === '::' || lower.includes('ffff:127.');
}

export async function isSSRFSafe(hostname: string): Promise<boolean> {
  // Direct IP address check
  const ipv4Regex = /^\d{1,3}(\.\d{1,3}){3}$/;
  if (ipv4Regex.test(hostname)) {
    return !isPrivateIPv4(hostname);
  }
  // IPv6
  if (hostname.startsWith('[') || hostname.includes(':')) {
    return !isPrivateIPv6(hostname.replace(/^\[|\]$/g, ''));
  }
  // Domain - check cache first, then resolve
  const now = Date.now();
  const cached = dnsCache.get(hostname);
  if (cached && cached.expires > now) {
    return cached.safe;
  }

  let safe: boolean;
  try {
    const result = await resolve4(hostname);
    if (result.some((ip: string) => isPrivateIPv4(ip))) { safe = false; }
    else {
      try {
        const result6 = await resolve6(hostname);
        safe = !result6.some((ip: string) => isPrivateIPv6(ip));
      } catch { safe = true; /* no AAAA record is fine */ }
    }
  } catch {
    try {
      const result6 = await resolve6(hostname);
      safe = !result6.some((ip: string) => isPrivateIPv6(ip));
    } catch {
      safe = false; // Unresolvable domain is unsafe
    }
  }

  dnsCache.set(hostname, { safe, expires: now + DNS_CACHE_TTL });
  return safe;
}
