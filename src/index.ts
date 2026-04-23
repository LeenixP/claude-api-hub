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
import { logger, setLogLevel } from './logger.js';
import { destroyAgents } from './services/forwarder.js';
import { LogManager } from './services/log-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createProvider(key: string, config: import('./providers/types.js').ProviderConfig): Provider {
  if (config.passthrough) {
    return new ClaudeProvider(config);
  }
  if (key === 'claude' && !('passthrough' in config)) {
    logger.warn(`Provider "${key}" looks like Anthropic but missing passthrough:true — using OpenAI translation.`);
  }
  return new GenericOpenAIProvider(config);
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.logLevel) setLogLevel(config.logLevel);
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
    logger.error('No providers loaded. Exiting.');
    process.exit(1);
  }

  const router = createRouter(providers, config.defaultProvider, config.aliases ?? {});
  const logManager = new LogManager();
  const server = createServer(router, config, logManager);

  server.listen(config.port, config.host, () => {
    logger.info(`api-hub listening on http://${config.host}:${config.port}`);
    logger.info(`Providers: ${providers.map(p => p.name).join(', ')}`);
    if (config.aliases) {
      const aliasStr = Object.entries(config.aliases).map(([k, v]) => `${k}→${v}`).join(', ');
      logger.info(`Aliases: ${aliasStr}`);
    }
  });

  function gracefulShutdown(signal: string): void {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      logger.info('All connections closed.');
      destroyAgents();
      logManager.close();
      logger.info('Cleanup complete, exiting.');
      process.exit(0);
    });
    setTimeout(() => {
      logger.warn('Graceful shutdown timed out after 30s, forcing exit.');
      destroyAgents();
      logManager.close();
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
