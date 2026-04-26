import { resolve4, resolve6 } from 'node:dns/promises';

const DNS_CACHE_TTL = 120_000; // 120 seconds
const DNS_CACHE_MAX_SIZE = 1000;

class LruDnsCache {
  private cache = new Map<string, { safe: boolean; expires: number }>();

  get(key: string): { safe: boolean; expires: number } | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    // LRU: move to end to mark as recently used
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  set(key: string, value: { safe: boolean; expires: number }): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= DNS_CACHE_MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

const dnsCache = new LruDnsCache();
const inflightChecks = new Map<string, Promise<boolean>>();

export function clearDnsCache(): void {
  dnsCache.clear();
  inflightChecks.clear();
}

const PRIVATE_RANGES = [
  // IPv4 RFC1918
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  // 192.168.x and 127.x allowed for local/LAN service access (e.g. Ollama)
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
  // ::1 (loopback) and ffff:127. (IPv4-mapped loopback) allowed for local access
  return lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80') || lower === '::';
}

/**
 * Resolve a hostname to a safe IP address.
 * Returns the first safe IPv4 address, or null if none found.
 * Throws if the hostname resolves to any private IP.
 */
export async function resolveSafeIP(hostname: string): Promise<string | null> {
  // Direct IP address check
  const ipv4Regex = /^\d{1,3}(\.\d{1,3}){3}$/;
  if (ipv4Regex.test(hostname)) {
    if (isPrivateIPv4(hostname)) throw new Error(`SSRF: blocked private IP ${hostname}`);
    return hostname;
  }
  if (hostname.startsWith('[') || hostname.includes(':')) {
    const clean = hostname.replace(/^\[|\]$/g, '');
    if (isPrivateIPv6(clean)) throw new Error(`SSRF: blocked private IP ${hostname}`);
    return clean;
  }

  let v4Result: string[] = [];
  let v6Result: string[] = [];
  try { v4Result = await resolve4(hostname); } catch { /* ignore */ }
  try { v6Result = await resolve6(hostname); } catch { /* ignore */ }

  if (v4Result.length === 0 && v6Result.length === 0) {
    throw new Error(`SSRF: unresolvable hostname ${hostname}`);
  }

  if (v4Result.some((ip: string) => isPrivateIPv4(ip))) {
    throw new Error(`SSRF: hostname ${hostname} resolves to private IPv4`);
  }
  if (v6Result.some((ip: string) => isPrivateIPv6(ip))) {
    throw new Error(`SSRF: hostname ${hostname} resolves to private IPv6`);
  }

  return v4Result[0] ?? v6Result[0] ?? null;
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

  const existing = inflightChecks.get(hostname);
  if (existing) return existing;

  const checkPromise = (async (): Promise<boolean> => {
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
  })();

  inflightChecks.set(hostname, checkPromise);
  checkPromise.finally(() => inflightChecks.delete(hostname));
  return checkPromise;
}
