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
  options?: Record<string, unknown>;
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
  maxQps: number;
  maxRpm: number;
  maxTps: number;
  totalRequests: number;
  totalTokens: number;
}

export interface TokenStats {
  summary: { totalTokens: number; promptTokens: number; completionTokens: number; requestCount: number };
  byProvider: Array<{ provider: string; totalTokens: number; promptTokens: number; completionTokens: number; requestCount: number }>;
  byModel: Array<{ provider: string; model: string; totalTokens: number; promptTokens: number; completionTokens: number; requestCount: number; lastUsedAt?: string }>;
  daily: Array<{ date: string; totalTokens: number; promptTokens: number; completionTokens: number; requestCount: number }>;
}

export type Theme = 'system' | 'dark' | 'light';
export type Page = 'dashboard' | 'providers' | 'aliases' | 'logs' | 'config';
