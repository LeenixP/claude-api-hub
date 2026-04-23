#!/usr/bin/env node
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import { createRouter } from './router.js';
import { createServer } from './server.js';
import { Provider } from './providers/types.js';
import { ClaudeProvider } from './providers/claude.js';
import { GenericOpenAIProvider } from './providers/generic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createProvider(key: string, config: import('./providers/types.js').ProviderConfig): Provider {
  if (config.passthrough) {
    return new ClaudeProvider(config);
  }
  if (key === 'claude' && !('passthrough' in config)) {
    console.warn(`[warn] Provider "${key}" looks like Anthropic but missing passthrough:true — using OpenAI translation. Set passthrough:true in config if this is an Anthropic-format API.`);
  }
  return new GenericOpenAIProvider(config);
}

async function main(): Promise<void> {
  const config = loadConfig();
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
    config.version = pkg.version;
  } catch { /* ignore */ }

  const providers: Provider[] = [];
  for (const [key, providerConfig] of Object.entries(config.providers)) {
    if (!providerConfig.enabled) continue;
    providers.push(createProvider(key, providerConfig));
  }

  if (providers.length === 0) {
    console.error('[error] No providers loaded. Exiting.');
    process.exit(1);
  }

  const router = createRouter(providers, config.defaultProvider, config.aliases ?? {});
  const server = createServer(router, config);

  server.listen(config.port, config.host, () => {
    console.log(`[info] api-hub listening on http://${config.host}:${config.port}`);
    console.log(`[info] Providers: ${providers.map(p => p.name).join(', ')}`);
    if (config.aliases) {
      const aliasStr = Object.entries(config.aliases).map(([k, v]) => `${k}→${v}`).join(', ');
      console.log(`[info] Aliases: ${aliasStr}`);
    }
  });

  function gracefulShutdown(signal: string): void {
    console.log(`[info] Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      console.log('[info] All connections closed, exiting.');
      process.exit(0);
    });
    setTimeout(() => {
      console.warn('[warn] Graceful shutdown timed out after 30s, forcing exit.');
      process.exit(1);
    }, 30000).unref();
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
