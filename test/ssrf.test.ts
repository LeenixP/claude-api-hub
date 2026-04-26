import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}));

import { isSSRFSafe, clearDnsCache } from '../src/utils/ssrf.js';
import { resolve4, resolve6 } from 'node:dns/promises';

const mockResolve4 = vi.mocked(resolve4);
const mockResolve6 = vi.mocked(resolve6);

beforeEach(() => {
  clearDnsCache();
  vi.clearAllMocks();
});

describe('isSSRFSafe - IPv4 private ranges', () => {
  it('rejects 10.x.x.x (RFC1918)', async () => {
    expect(await isSSRFSafe('10.0.0.1')).toBe(false);
    expect(await isSSRFSafe('10.255.255.255')).toBe(false);
  });

  it('rejects 172.16.x.x - 172.31.x.x (RFC1918)', async () => {
    expect(await isSSRFSafe('172.16.0.1')).toBe(false);
    expect(await isSSRFSafe('172.31.255.255')).toBe(false);
  });

  it('allows 172.32.x.x (public)', async () => {
    expect(await isSSRFSafe('172.32.0.1')).toBe(true);
  });

  it('allows 192.168.x.x (LAN access)', async () => {
    expect(await isSSRFSafe('192.168.0.1')).toBe(true);
    expect(await isSSRFSafe('192.168.255.255')).toBe(true);
  });

  it('allows 127.x.x.x (loopback for local services)', async () => {
    expect(await isSSRFSafe('127.0.0.1')).toBe(true);
    expect(await isSSRFSafe('127.255.255.255')).toBe(true);
  });

  it('rejects 169.254.x.x (link-local)', async () => {
    expect(await isSSRFSafe('169.254.0.1')).toBe(false);
    expect(await isSSRFSafe('169.254.255.255')).toBe(false);
  });

  it('rejects 0.x.x.x (broadcast)', async () => {
    expect(await isSSRFSafe('0.0.0.0')).toBe(false);
    expect(await isSSRFSafe('0.255.255.255')).toBe(false);
  });

  it('allows public IPv4 addresses', async () => {
    expect(await isSSRFSafe('8.8.8.8')).toBe(true);
    expect(await isSSRFSafe('1.1.1.1')).toBe(true);
    expect(await isSSRFSafe('203.0.113.1')).toBe(true);
  });
});

describe('isSSRFSafe - IPv6 private ranges', () => {
  it('allows ::1 (loopback for local services)', async () => {
    expect(await isSSRFSafe('::1')).toBe(true);
  });

  it('rejects fc00:: (unique local)', async () => {
    expect(await isSSRFSafe('fc00::1')).toBe(false);
  });

  it('rejects fd00:: (unique local)', async () => {
    expect(await isSSRFSafe('fd00::1')).toBe(false);
  });

  it('rejects fe80:: (link-local)', async () => {
    expect(await isSSRFSafe('fe80::1')).toBe(false);
  });

  it('rejects :: (unspecified)', async () => {
    expect(await isSSRFSafe('::')).toBe(false);
  });

  it('allows ::ffff:127.0.0.1 (IPv4-mapped loopback)', async () => {
    expect(await isSSRFSafe('::ffff:127.0.0.1')).toBe(true);
  });

  it('allows public IPv6 addresses', async () => {
    expect(await isSSRFSafe('2001:4860:4860::8888')).toBe(true);
  });
});

describe('isSSRFSafe - domain resolution', () => {
  it('rejects domain resolving to private IPv4', async () => {
    mockResolve4.mockResolvedValue(['10.0.0.1']);
    mockResolve6.mockRejectedValue(new Error('no AAAA'));
    expect(await isSSRFSafe('evil.example.com')).toBe(false);
  });

  it('allows domain resolving to loopback IPv6', async () => {
    mockResolve4.mockRejectedValue(new Error('not found'));
    mockResolve6.mockResolvedValue(['::1']);
    expect(await isSSRFSafe('evil.example.com')).toBe(true);
  });

  it('allows domain resolving to public IP', async () => {
    mockResolve4.mockResolvedValue(['93.184.216.34']);
    mockResolve6.mockRejectedValue(new Error('no AAAA'));
    expect(await isSSRFSafe('example.com')).toBe(true);
  });

  it('returns false for unresolvable domain', async () => {
    mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolve6.mockRejectedValue(new Error('ENOTFOUND'));
    expect(await isSSRFSafe('nonexistent.invalid')).toBe(false);
  });
});

describe('isSSRFSafe - DNS cache', () => {
  it('caches domain result and skips DNS on second call', async () => {
    mockResolve4.mockResolvedValue(['93.184.216.34']);

    const first = await isSSRFSafe('cached.example.com');
    expect(first).toBe(true);
    expect(mockResolve4).toHaveBeenCalledTimes(1);

    const second = await isSSRFSafe('cached.example.com');
    expect(second).toBe(true);
    expect(mockResolve4).toHaveBeenCalledTimes(1); // no additional call
  });

  it('clearDnsCache forces fresh DNS resolution', async () => {
    mockResolve4.mockResolvedValue(['93.184.216.34']);

    await isSSRFSafe('refresh.example.com');
    expect(mockResolve4).toHaveBeenCalledTimes(1);

    clearDnsCache();

    await isSSRFSafe('refresh.example.com');
    expect(mockResolve4).toHaveBeenCalledTimes(2);
  });
});
