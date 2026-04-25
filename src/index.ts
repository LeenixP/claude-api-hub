#!/usr/bin/env node
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import { createRouter } from './router.js';
import { createServer } from './server.js';
import { rebuildProviders } from './server.js';
import { TokenRefresher } from './services/token-refresher.js';
import { createProvider } from './providers/factory.js';
import type { Provider } from './providers/types.js';
import { logger, setLogLevel } from './logger.js';
import { destroyAgents } from './services/forwarder.js';
import { DEFAULT_TOKEN_REFRESH_MINUTES } from './constants.js';
import { LogManager } from './services/log-manager.js';
import { EventBus } from './services/event-bus.js';
import { RateTracker } from './services/rate-tracker.js';
import { KeyPool } from './services/pool-manager.js';
import { detectInstallMethod, saveRestartInfo } from './install-info.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(): { port?: number; host?: string; config?: string } {
  const args = process.argv.slice(2);
  const result: { port?: number; host?: string; config?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      result.port = parseInt(args[++i]);
    } else if ((args[i] === '--host' || args[i] === '-h') && args[i + 1]) {
      result.host = args[++i];
    } else if ((args[i] === '--config' || args[i] === '-c') && args[i + 1]) {
      result.config = args[++i];
    } else if (args[i] === '--help') {
      console.log(`Usage: claude-api-hub [options]

Options:
  -p, --port <port>    Port to listen on (default: from config)
  -h, --host <host>    Host to bind to (default: from config)
  -c, --config <path>  Path to config file
  --help               Show this help message

Environment variables:
  API_HUB_PORT         Override port
  API_HUB_HOST         Override host
  ADMIN_TOKEN          Admin authentication token`);
      process.exit(0);
    }
  }
  return result;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const config = loadConfig(args.config);
  if (config.logLevel) setLogLevel(config.logLevel);

  // Detect install method and save restart info for auto-update
  detectInstallMethod();
  saveRestartInfo();

  if (args.port) config.port = args.port;
  if (args.host) config.host = args.host;
  if (process.env.API_HUB_PORT) config.port = parseInt(process.env.API_HUB_PORT);
  if (process.env.API_HUB_HOST) config.host = process.env.API_HUB_HOST;

  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
    config.version = pkg.version;
  } catch (err) { logger.warn('Failed to read package.json', { error: (err as Error).message }); }

  const providers = Object.entries(config.providers)
    .filter(([, pc]) => pc.enabled)
    .map(([key, pc]) => { pc.key = key; return createProvider(pc); })
    .filter((p): p is Provider => p !== null);

  if (providers.length === 0) {
    logger.error('No providers loaded. Check provider configuration or credentials. Exiting.');
    process.exit(1);
  }

  const router = createRouter(providers, config.defaultProvider, config.aliases ?? {}, config.fallbackChain ?? {});
  const eventBus = new EventBus();
  const rateTracker = new RateTracker();
  const logManager = new LogManager(undefined, undefined, undefined, eventBus);
  const server = createServer(router, config, logManager, eventBus, rateTracker);

  // Auto-refresh OAuth tokens (default 30 min, configurable via tokenRefreshMinutes)
  const refreshMinutes = config.tokenRefreshMinutes || DEFAULT_TOKEN_REFRESH_MINUTES;
  const tokenRefresher = new TokenRefresher(router, config, rebuildProviders, refreshMinutes);
  tokenRefresher.start();

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${config.port} is already in use. Try a different port with --port <port> or API_HUB_PORT env var.`);
    } else if (err.code === 'EACCES') {
      logger.error(`Permission denied for port ${config.port}. Try a port > 1024.`);
    } else {
      logger.error(`Server error: ${err.message}`);
    }
    process.exit(1);
  });

  server.listen(config.port, config.host, () => {
    logger.info(`api-hub v${config.version || '?'} listening on http://${config.host}:${config.port}`);
    logger.info(`Dashboard: http://localhost:${config.port}`);
    logger.info(`Providers: ${providers.map(p => p.name).join(', ')}`);
    if (config.aliases) {
      const aliasStr = Object.entries(config.aliases).map(([k, v]) => `${k}→${v}`).join(', ');
      logger.info(`Aliases: ${aliasStr}`);
    }
  });

  // Restore KeyPool state on startup
  KeyPool.loadState([]);

  let isShuttingDown = false;
  function gracefulShutdown(signal: string): void {
    if (isShuttingDown) {
      logger.warn('Force exit.');
      process.exit(1);
    }
    isShuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);

    // Signal clients to stop sending new requests
    server.on('connection', (socket) => {
      socket.setNoDelay(true);
    });
    server.maxHeadersCount = 0;

    tokenRefresher.stop();

    const startTime = Date.now();
    const timeoutMs = 30000;
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed < timeoutMs) {
        logger.info(`Shutting down... ${Math.round(elapsed / 1000)}s elapsed, waiting for connections to close.`);
      }
    }, 5000);

    server.close(() => {
      clearInterval(progressInterval);
      logger.info('Server closed. Saving state and exiting.');
      destroyAgents();
      rateTracker.destroy();
      logManager.close();
      process.exit(0);
    });

    setTimeout(() => {
      clearInterval(progressInterval);
      logger.warn('Graceful shutdown timed out after 30s, forcing exit.');
      destroyAgents();
      rateTracker.destroy();
      logManager.close();
      process.exit(1);
    }, timeoutMs).unref();
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`);
    gracefulShutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
  });
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
