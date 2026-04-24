export interface GatewayConfig {
  version?: string;
  port: number;
  host: string;
  defaultProvider: string;
  providers: Record<string, ProviderConfig>;
  aliases?: Record<string, string>;
  tierTimeouts?: Record<string, TierTimeout>;
  logLevel?: string;
  password?: string;
  adminToken?: string;
  corsOrigins?: string[];
  rateLimitRpm?: number;
  streamTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
  maxResponseBytes?: number;
  trustProxy?: boolean;
  fallbackChain?: Record<string, string>;
  tokenRefreshMinutes?: number;
}

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  models: string[];
  defaultModel: string;
  enabled: boolean;
  prefix?: string | string[];
  passthrough?: boolean;
  authMode?: string;
  providerType?: string;
  kiroAuthMethod?: string;
  kiroRegion?: string;
  kiroCredsPath?: string;
  kiroStartUrl?: string;
}

export interface TierTimeout {
  timeoutMs: number;
  streamTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
}

export interface LogEntry {
  time: string;
  requestId: string;
  claudeModel: string;
  resolvedModel: string;
  provider: string;
  protocol: string;
  targetUrl?: string;
  stream: boolean;
  status: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  logFile?: string;
}

export interface ModelInfo {
  id: string;
  object: string;
  owned_by: string;
}

export interface Stats {
  qps: number;
  rpm: number;
  tps: number;
}

export type Theme = 'system' | 'dark' | 'light';
export type Page = 'dashboard' | 'providers' | 'aliases' | 'logs' | 'config';
