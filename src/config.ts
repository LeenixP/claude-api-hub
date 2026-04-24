import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { GatewayConfig, ProviderConfig } from './providers/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALLOWED_ENV_PREFIXES = [
  'ANTHROPIC_', 'MOONSHOT_', 'MINIMAX_', 'ZHIPUAI_',
  'OPENAI_', 'DEEPSEEK_', 'ADMIN_', 'API_HUB_',
];

function interpolateEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
    if (!ALLOWED_ENV_PREFIXES.some(p => varName.startsWith(p))) {
      console.warn(`[warn] Blocked env var interpolation: ${varName} (not in allowed prefixes)`);
      return '';
    }
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
  if (!config.port || typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
    throw new Error('Config: "port" must be a number between 1 and 65535');
  }
  if (!config.host || typeof config.host !== 'string') {
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
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (config.logLevel && !validLogLevels.includes(config.logLevel)) {
    throw new Error(`Config: "logLevel" must be one of: ${validLogLevels.join(', ')}`);
  }
  for (const [name, provider] of Object.entries(config.providers as Record<string, ProviderConfig>)) {
    if (!provider.baseUrl) throw new Error(`Config: provider "${name}" missing "baseUrl"`);
    try { new URL(provider.baseUrl); } catch {
      throw new Error(`Config: provider "${name}" has invalid "baseUrl": ${provider.baseUrl}`);
    }
    if (!provider.models || provider.models.length === 0) {
      throw new Error(`Config: provider "${name}" missing "models"`);
    }
    if (!provider.apiKey || provider.apiKey.trim() === '') {
      console.warn(`[warn] Provider "${name}" has empty apiKey — check environment variables`);
    }
  }
  const enabledCount = Object.values(config.providers as Record<string, ProviderConfig>).filter(p => p.enabled).length;
  if (enabledCount === 0) {
    throw new Error('Config: at least one provider must be enabled');
  }
  if (config.rateLimitRpm !== undefined && (typeof config.rateLimitRpm !== 'number' || config.rateLimitRpm < 0)) {
    throw new Error('Config: "rateLimitRpm" must be a non-negative number');
  }
  if (config.streamTimeoutMs !== undefined && (typeof config.streamTimeoutMs !== 'number' || config.streamTimeoutMs < 1000)) {
    throw new Error('Config: "streamTimeoutMs" must be at least 1000ms');
  }
  if (config.streamIdleTimeoutMs !== undefined && (typeof config.streamIdleTimeoutMs !== 'number' || config.streamIdleTimeoutMs < 1000)) {
    throw new Error('Config: "streamIdleTimeoutMs" must be at least 1000ms');
  }
  if (config.tokenRefreshMinutes !== undefined && (typeof config.tokenRefreshMinutes !== 'number' || config.tokenRefreshMinutes < 1)) {
    throw new Error('Config: "tokenRefreshMinutes" must be at least 1');
  }
  if (config.corsOrigins) {
    for (const origin of config.corsOrigins) {
      if (origin !== '*') {
        try { new URL(origin); } catch {
          throw new Error(`Config: invalid CORS origin "${origin}"`);
        }
      }
    }
  }
  for (const [tier, timeout] of Object.entries(config.tierTimeouts ?? {})) {
    if (!timeout || typeof timeout.timeoutMs !== 'number') {
      throw new Error(`Config: tier "${tier}" missing valid timeoutMs`);
    }
  }
}

let resolvedConfigPath: string | null = null;

export function getConfigPath(): string {
  if (!resolvedConfigPath) {
    throw new Error('Config not loaded yet. Call loadConfig() first.');
  }
  return resolvedConfigPath;
}

export function loadConfig(configPath?: string): GatewayConfig {
  const candidates = configPath ? [configPath] : [
    join(homedir(), '.claude-api-hub/providers.json'),
    resolve(process.cwd(), 'config/providers.json'),
    resolve(__dirname, '../config/providers.json'),
    resolve(__dirname, '../../config/providers.json'),
  ];
  const filePath = candidates.find(p => existsSync(p));
  if (!filePath) {
    throw new Error(`Config not found. Searched:\n${candidates.join('\n')}\nCreate config/providers.json or pass --config <path>.`);
  }
  resolvedConfigPath = filePath;
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const config = interpolateConfig(parsed) as GatewayConfig;
  validateConfig(config);
  return config;
}
