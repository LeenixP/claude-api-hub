import http from 'http';
import os from 'os';
import process from 'process';
import type { RouteContext } from './types.js';

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export async function handleSystemRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: RouteContext,
  pathname: string,
  cors: Record<string, string>,
): Promise<boolean> {
  if (req.method !== 'GET') return false;

  if (pathname === '/api/system-info') {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const body = JSON.stringify({
      localVersion: ctx.config.version || 'unknown',
      uptime: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.release()}`,
      memoryUsage: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
      },
      cpuUsage: {
        user: cpu.user,
        system: cpu.system,
      },
      processPid: process.pid,
      serverTime: new Date().toISOString(),
    });
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(body);
    return true;
  }

  if (pathname === '/api/check-update') {
    const localVersion = ctx.config.version || 'unknown';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const fetchRes = await fetch('https://registry.npmjs.org/claude-api-hub/latest', {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!fetchRes.ok) {
        throw new Error(`npm registry returned ${fetchRes.status}`);
      }
      const data = await fetchRes.json() as { version?: string };
      const latestVersion = data.version || null;
      const hasUpdate = latestVersion ? compareSemver(latestVersion, localVersion) > 0 : false;
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ localVersion, latestVersion, hasUpdate }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({
        localVersion,
        latestVersion: null,
        hasUpdate: false,
        error: (err as Error).message,
      }));
    }
    return true;
  }

  return false;
}
