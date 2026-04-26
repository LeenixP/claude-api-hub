// ═══════════════════════════════════════════════════════════════════════
//  Config Schema — Single source of truth for ALL parameters
// ═══════════════════════════════════════════════════════════════════════
//
//  HOW TO USE (read this before editing):
//
//  ┌─────────────────────────────────────────────────────────────────┐
//  │  ADD a parameter:                                               │
//  │    Add one line to CONFIG_SCHEMA below. That's it.              │
//  │    Existing configs get the default on next startup.            │
//  │                                                                 │
//  │  REMOVE a parameter:                                            │
//  │    Delete the line from CONFIG_SCHEMA. That's it.               │
//  │    Existing configs automatically strip the key on next load.   │
//  │                                                                 │
//  │  CHANGE a default value:                                        │
//  │    Edit the number/string in CONFIG_SCHEMA. That's it.          │
//  │    New installs get the new default.                            │
//  │    EXISTING users KEEP their value (we never overwrite          │
//  │    user config — they may have set it intentionally).           │
//  │                                                                 │
//  │  CARE REQUIRED — parameter affects validation logic:            │
//  │    If the parameter has validation rules (port range,           │
//  │    logLevel enum, etc.), also check validateConfig() in         │
//  │    src/config.ts to ensure the validation matches.              │
//  └─────────────────────────────────────────────────────────────────┘
//
//  HOW IT WORKS (for understanding, not for editing):
//
//  On every startup, loadConfig() in src/config.ts does:
//
//    1. Load user's config file (~/.claude-api-hub/providers.json)
//    2. buildDefaults() → generate defaults from CONFIG_SCHEMA
//    3. Merge: defaults first, user values on top
//    4. normalizeAgainstSchema():
//       a. Delete keys NOT in CONFIG_SCHEMA and NOT in PRESERVED_KEYS
//       b. Add keys FROM CONFIG_SCHEMA that are missing
//    5. Write cleaned config back to disk
//    6. Validate and return
//
//  PRESERVED_KEYS are user-data keys that the schema doesn't manage
//  (providers, aliases, etc.). They pass through untouched.
//  getAllowedConfigKeys() combines both for API-level validation.
//
// ═══════════════════════════════════════════════════════════════════════

import type { ProviderConfig } from './providers/types.js';

// ── All config parameters with their default values ──────────────────
export const CONFIG_SCHEMA: Record<string, { default: unknown }> = {
  port:              { default: 9800 },
  host:              { default: '127.0.0.1' },
  logLevel:          { default: 'info' },
  rateLimitRpm:      { default: 0 },
  streamTimeoutMs:   { default: 600_000 },    // 10 minutes
  streamIdleTimeoutMs: { default: 300_000 },  // 5 minutes
  maxResponseBytes:  { default: 10_485_760 }, // 10 MB
  trustProxy:        { default: false },
  tokenRefreshMinutes: { default: 30 },
};

// ── User-data keys (preserved as-is, not validated against schema) ───
// These keys are stored in the user config file but their values are
// not managed by CONFIG_SCHEMA. They pass through normalizeAgainstSchema
// without modification.
export const PRESERVED_KEYS = new Set([
  'providers',      // provider definitions (managed via Dashboard)
  'aliases',        // model alias mappings
  'tierTimeouts',   // per-tier timeout overrides
  'password',       // admin dashboard password
  'adminToken',     // admin auth token
  'corsOrigins',    // CORS allowed origins
  'fallbackChain',  // provider fallback chain
  'version',        // gateway version stamp
]);

// ── Derived helpers (no need to edit these) ──────────────────────────

/** All keys that the API allows for config save/import operations. */
export function getAllowedConfigKeys(): string[] {
  return [...Object.keys(CONFIG_SCHEMA), ...PRESERVED_KEYS];
}

/** Build a plain object of { key: defaultValue } from CONFIG_SCHEMA. */
export function buildDefaults(): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(CONFIG_SCHEMA)) {
    defaults[key] = def.default;
  }
  return defaults;
}

// ── Default provider template (first-time install only) ──────────────
// This is written to the config file on first startup if no config
// exists. Once the user adds their own providers, this is replaced.
export const DEFAULT_PROVIDERS: Record<string, ProviderConfig> = {
  claude: {
    name: 'Claude',
    baseUrl: 'https://api.anthropic.com',
    apiKey: '${ANTHROPIC_API_KEY}',
    models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5'],
    defaultModel: 'claude-sonnet-4-6',
    enabled: true,
  },
};
