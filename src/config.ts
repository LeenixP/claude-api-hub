import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GatewayConfig, ProviderConfig } from './providers/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function interpolateEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] ?? '';
  });
}

function interpolateConfig(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return interpolateEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(interpolateConfig);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = interpolateConfig(val);
    }
    return result;
  }
  return obj;
}

function validateConfig(config: GatewayConfig): void {
  if (!config.port || typeof config.port !== 'number') {
    throw new Error('Config: missing or invalid "port"');
  }
  if (!config.host) {
    throw new Error('Config: missing "host"');
  }
  if (!config.defaultProvider) {
    throw new Error('Config: missing "defaultProvider"');
  }
  if (!config.providers || typeof config.providers !== 'object') {
    throw new Error('Config: missing "providers"');
  }
  if (!config.providers[config.defaultProvider]) {
    throw new Error(`Config: defaultProvider "${config.defaultProvider}" not found in providers`);
  }
  for (const [name, provider] of Object.entries(config.providers as Record<string, ProviderConfig>)) {
    if (!provider.baseUrl) throw new Error(`Config: provider "${name}" missing "baseUrl"`);
    if (!provider.models || provider.models.length === 0) {
      throw new Error(`Config: provider "${name}" missing "models"`);
    }
  }
}

export function loadConfig(configPath?: string): GatewayConfig {
  const candidates = configPath ? [configPath] : [
    resolve(process.cwd(), 'config/providers.json'),
    resolve(__dirname, '../config/providers.json'),
    resolve(__dirname, '../../config/providers.json'),
  ];
  const filePath = candidates.find(p => existsSync(p));
  if (!filePath) {
    throw new Error(`Config not found. Searched:\n${candidates.join('\n')}\nCreate config/providers.json or pass --config <path>.`);
  }
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const config = interpolateConfig(parsed) as GatewayConfig;
  validateConfig(config);
  return config;
}
