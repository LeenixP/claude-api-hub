import http from 'http';
import process from 'process';
import { LogManager } from '../services/log-manager.js';
import type { RateTracker } from '../services/rate-tracker.js';
import type { RouteContext } from './types.js';

/**
 * Prometheus-style metrics endpoint.
 * Returns text/plain metrics for scraping by Prometheus or compatible tools.
 */
export async function handleMetrics(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: RouteContext,
  pathname: string,
  cors: Record<string, string>,
): Promise<boolean> {
  if (req.method === 'GET' && pathname === '/metrics') {
    const lines: string[] = [];

    // --- process metrics ---
    const mem = process.memoryUsage();
    lines.push('# HELP process_resident_memory_bytes Resident memory size in bytes.');
    lines.push('# TYPE process_resident_memory_bytes gauge');
    lines.push(`process_resident_memory_bytes ${mem.rss}`);

    lines.push('# HELP process_heap_bytes Process heap size in bytes.');
    lines.push('# TYPE process_heap_bytes gauge');
    lines.push(`process_heap_bytes ${mem.heapTotal}`);

    lines.push('# HELP process_heap_used_bytes Process heap used in bytes.');
    lines.push('# TYPE process_heap_used_bytes gauge');
    lines.push(`process_heap_used_bytes ${mem.heapUsed}`);

    lines.push('# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.');
    lines.push('# TYPE process_cpu_user_seconds_total counter');
    const cpuUsage = process.cpuUsage();
    lines.push(`process_cpu_user_seconds_total ${(cpuUsage.user / 1e6).toFixed(6)}`);

    lines.push('# HELP process_cpu_system_seconds_total Total system CPU time spent in seconds.');
    lines.push('# TYPE process_cpu_system_seconds_total counter');
    lines.push(`process_cpu_system_seconds_total ${(cpuUsage.system / 1e6).toFixed(6)}`);

    lines.push('# HELP process_uptime_seconds Number of seconds since the process started.');
    lines.push('# TYPE process_uptime_seconds counter');
    lines.push(`process_uptime_seconds ${Math.floor(process.uptime())}`);

    // --- rate tracker metrics ---
    const rateTracker = ctx.rateTracker;
    if (rateTracker) {
      lines.push('# HELP api_hub_requests_per_minute Requests per minute.');
      lines.push('# TYPE api_hub_requests_per_minute gauge');
      lines.push(`api_hub_requests_per_minute ${rateTracker.getRPM()}`);

      lines.push('# HELP api_hub_tokens_per_second Tokens per second.');
      lines.push('# TYPE api_hub_tokens_per_second gauge');
      lines.push(`api_hub_tokens_per_second ${rateTracker.getTPS()}`);
    }

    // --- provider health metrics ---
    lines.push('# HELP api_hub_provider_up Whether each provider is up (1) or down (0).');
    lines.push('# TYPE api_hub_provider_up gauge');
    for (const provider of ctx.router.getProviders()) {
      const up = provider.isHealthy ? (provider.isHealthy() ? 1 : 0) : 1;
      lines.push(`api_hub_provider_up{name="${provider.name}"} ${up}`);
    }

    // --- active connections (best-effort via http server) ---
    const server = (res as http.ServerResponse & { socket?: { server?: http.Server } }).socket?.server;
    if (server) {
      // Node.js http.Server does not expose a direct connection count,
      // but we can track via getConnections if available.
      try {
        const conns = await new Promise<number>((resolve, reject) => {
          server.getConnections((err, count) => {
            if (err) reject(err);
            else resolve(count);
          });
        });
        lines.push('# HELP api_hub_active_connections Number of active HTTP connections.');
        lines.push('# TYPE api_hub_active_connections gauge');
        lines.push(`api_hub_active_connections ${conns}`);
      } catch { /* ignore */ }
    }

    const body = lines.join('\n') + '\n';
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...cors });
    res.end(body);
    return true;
  }

  return false;
}
