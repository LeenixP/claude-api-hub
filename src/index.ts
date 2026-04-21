#!/usr/bin/env node
import { loadConfig } from './config.js';
import { createRouter } from './router.js';
import { createServer } from './server.js';
import { Provider } from './providers/types.js';

async function main(): Promise<void> {
  const config = loadConfig();

  // Dynamically import enabled providers
  const providers: Provider[] = [];
  for (const [key, providerConfig] of Object.entries(config.providers)) {
    if (!providerConfig.enabled) continue;
    try {
      const mod = await import(`./providers/${key}.js`);
      const ProviderClass = mod.default ?? mod[Object.keys(mod)[0]];
      if (typeof ProviderClass === 'function') {
        providers.push(new ProviderClass(providerConfig));
      } else {
        console.warn(`[warn] Provider "${key}" module did not export a constructor, skipping`);
      }
    } catch {
      console.warn(`[warn] Provider "${key}" not implemented yet, skipping`);
    }
  }

  if (providers.length === 0) {
    console.error('[error] No providers loaded. Exiting.');
    process.exit(1);
  }

  const router = createRouter(providers, config.defaultProvider);
  const server = createServer(router);

  const totalModels = providers.reduce((sum, p) => sum + p.config.models.length, 0);

  server.listen(config.port, config.host, () => {
    console.log(`[info] claude-api-hub listening on http://${config.host}:${config.port}`);
    console.log(`[info] Enabled providers: ${providers.map(p => p.name).join(', ')}`);
    console.log(`[info] Total models: ${totalModels}`);
    console.log(`[info] Default provider: ${config.defaultProvider}`);
  });

  function shutdown(): void {
    console.log('[info] Shutting down...');
    server.close(() => {
      console.log('[info] Server closed.');
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
