import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import type { ProviderConfig } from '../providers/types.js';

export interface ProviderHealth {
  name: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  timestamp: string;
  providers: ProviderHealth[];
}

export function checkProviderHealth(config: ProviderConfig): Promise<ProviderHealth> {
  return new Promise((resolve) => {
    const start = Date.now();
    const url = new URL(`${config.baseUrl}/v1/models`);
    const isHttps = url.protocol === 'https:';
    const req = (isHttps ? httpsRequest : httpRequest)(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'x-api-key': config.apiKey,
        },
        timeout: 5000,
      },
      (res) => {
        res.resume(); // drain
        const latencyMs = Date.now() - start;
        const ok = res.statusCode !== undefined && res.statusCode < 500;
        resolve({ name: config.name, ok, latencyMs });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ name: config.name, ok: false, latencyMs: Date.now() - start, error: 'timeout' });
    });

    req.on('error', (err) => {
      resolve({ name: config.name, ok: false, latencyMs: Date.now() - start, error: err.message });
    });

    req.end();
  });
}

export async function checkAllProviders(
  configs: Record<string, ProviderConfig>
): Promise<HealthReport> {
  const checks = Object.values(configs)
    .filter((c) => c.enabled)
    .map((c) => checkProviderHealth(c));
  const providers = await Promise.all(checks);
  return { timestamp: new Date().toISOString(), providers };
}
