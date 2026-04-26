import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, chmodSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { GatewayConfig, ProviderConfig } from './providers/types.js';
import { logger } from './logger.js';
import { CONFIG_SCHEMA, buildDefaults, DEFAULT_PROVIDERS, PRESERVED_KEYS } from './config-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HUB_DIR = join(homedir(), '.claude-api-hub');
const DEFAULT_CONFIG_PATH = join(HUB_DIR, 'providers.json');

const ALLOWED_ENV_PREFIXES = [
  'ANTHROPIC_', 'MOONSHOT_', 'MINIMAX_', 'ZHIPUAI_',
  'OPENAI_', 'DEEPSEEK_', 'ADMIN_', 'API_HUB_',
];

// ══════════════════════════════════════════
//  Config normalization (schema-driven)
// ══════════════════════════════════════════

/**
 * Clean user config against the schema:
 * - Keys not in schema → removed (deprecated)
 * - Keys in schema but missing → filled with defaults
 * - Providers: user's providers as-is, or DEFAULT_PROVIDERS if none
 * Returns true if the config was modified (should write back to disk).
 */
function normalizeAgainstSchema(cfg: Record<string, unknown>): boolean {
  let changed = false;
  const defaults = buildDefaults();

  // Remove keys not in schema and not user-preserved
  for (const key of Object.keys(cfg)) {
    if (!(key in CONFIG_SCHEMA) && !PRESERVED_KEYS.has(key)) {
      delete cfg[key];
      changed = true;
    }
  }

  // Fill missing keys from schema defaults
  for (const key of Object.keys(defaults)) {
    if (!(key in cfg)) {
      cfg[key] = defaults[key];
      changed = true;
    }
  }

  return changed;
}

// ══════════════════════════════════════════
//  Config validation
// ══════════════════════════════════════════

function interpolateEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
    if (!ALLOWED_ENV_PREFIXES.some(p => varName.startsWith(p))) {
      logger.warn(`Blocked env var interpolation: ${varName} (not in allowed prefixes)`);
      return '';
    }
    return process.env[varName] ?? '';
  });
}

function interpolateConfig(obj: unknown): unknown {
  if (typeof obj === 'string') return interpolateEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(interpolateConfig);
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
  if (!config.providers || typeof config.providers !== 'object') {
    throw new Error('Config: missing "providers"');
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
      logger.warn(`Provider "${name}" has empty apiKey — check environment variables`);
    }
  }
  const enabledCount = Object.values(config.providers as Record<string, ProviderConfig>).filter(p => p.enabled).length;
  if (enabledCount === 0) {
    throw new Error('No enabled providers found. Add a provider via Dashboard at http://localhost:' + config.port + ' or edit ~/.claude-api-hub/providers.json');
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

// ══════════════════════════════════════════
//  Public API
// ══════════════════════════════════════════

let resolvedConfigPath: string | null = null;

export function getConfigPath(): string {
  if (!resolvedConfigPath) {
    throw new Error('Config not loaded yet. Call loadConfig() first.');
  }
  return resolvedConfigPath;
}

/** Auto-fill passthrough for providers that use Anthropic protocol but didn't set it explicitly. */
export function normalizeProviders(config: GatewayConfig): void {
  for (const [name, pc] of Object.entries(config.providers)) {
    if (pc.passthrough === undefined && pc.authMode === 'anthropic') {
      pc.passthrough = true;
      logger.info(`Provider "${name}": auto-set passthrough=true (authMode=anthropic)`);
    }
  }
}

/** Backup current config before update. Called by system-info.ts before npm install. */
export function backupConfig(): void {
  try {
    if (!existsSync(HUB_DIR)) mkdirSync(HUB_DIR, { recursive: true });
    const backupPath = join(HUB_DIR, 'providers.backup.json');
    if (resolvedConfigPath && existsSync(resolvedConfigPath)) {
      copyFileSync(resolvedConfigPath, backupPath);
      chmodSync(backupPath, 0o600);
      logger.info(`Config backed up to ${backupPath}`);
    }
  } catch (err) {
    logger.warn(`Config backup failed: ${(err as Error).message}`);
  }
}

/** Restore config from backup (called after update failure). */
export function restoreConfig(): boolean {
  try {
    const backupPath = join(HUB_DIR, 'providers.backup.json');
    if (!existsSync(backupPath)) return false;
    copyFileSync(backupPath, DEFAULT_CONFIG_PATH);
    logger.info('Config restored from backup');
    return true;
  } catch (err) {
    logger.warn(`Config restore failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Load config from candidates, creating a default if none exists.
 * Priority: 1) explicit --config path  2) ~/.claude-api-hub/providers.json  3) cwd config/providers.json
 * If none found, generates a default config and saves to ~/.claude-api-hub/providers.json.
 */
export function loadConfig(configPath?: string): GatewayConfig {
  const candidates = configPath ? [configPath] : [
    DEFAULT_CONFIG_PATH,
    resolve(process.cwd(), 'config/providers.json'),
  ];

  // If explicit path given but doesn't exist, throw
  if (configPath && !existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  let filePath = candidates.find(p => existsSync(p));

  if (!filePath) {
    // No config exists — create a default and save it
    try {
      if (!existsSync(HUB_DIR)) mkdirSync(HUB_DIR, { recursive: true });
      const fresh: Record<string, unknown> = { ...buildDefaults(), providers: DEFAULT_PROVIDERS };
      writeFileSync(DEFAULT_CONFIG_PATH, JSON.stringify(fresh, null, 2), 'utf-8');
      chmodSync(DEFAULT_CONFIG_PATH, 0o600);
      filePath = DEFAULT_CONFIG_PATH;
      logger.info(`Created default config at ${DEFAULT_CONFIG_PATH}`);
    } catch (err) {
      throw new Error(`Config not found and could not create default. Searched:\n${candidates.join('\n')}\nError: ${(err as Error).message}`);
    }
  }

  resolvedConfigPath = filePath;
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const loaded = interpolateConfig(parsed) as unknown as Record<string, unknown>;

  // Start with schema defaults, overlay user values
  const merged: Record<string, unknown> = { ...buildDefaults(), ...loaded };
  // Preserve user's providers (or use DEFAULT_PROVIDERS if none)
  if (!merged.providers || Object.keys(merged.providers as object).length === 0) {
    merged.providers = DEFAULT_PROVIDERS;
  } else {
    merged.providers = loaded.providers;
  }

  // Auto-clean: remove deprecated keys, fill missing defaults
  const cleaned = normalizeAgainstSchema(merged);
  if (cleaned) {
    try {
      writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
      logger.info('Config auto-cleaned against schema');
    } catch { /* non-fatal */ }
  }

  const config = merged as unknown as GatewayConfig;
  normalizeProviders(config);
  validateConfig(config);
  return config;
}
