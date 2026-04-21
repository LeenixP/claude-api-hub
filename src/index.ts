#!/usr/bin/env node
import { loadConfig } from './config.js';
import { createRouter } from './router.js';
import { createServer } from './server.js';
import { Provider } from './providers/types.js';
import { ClaudeProvider } from './providers/claude.js';
import { GenericOpenAIProvider } from './providers/generic.js';

async function main(): Promise<void> {
  const config = loadConfig();

  // Load enabled providers using a factory approach:
  // - passthrough:true (or key === 'claude') → ClaudeProvider
  // - everything else → GenericOpenAIProvider (works with any OpenAI-compatible API)
  const providers: Provider[] = [];
  for (const [key, providerConfig] of Object.entries(config.providers)) {
    if (!providerConfig.enabled) continue;
    if (key === 'claude' || providerConfig.passthrough) {
      providers.push(new ClaudeProvider(providerConfig));
    } else {
      providers.push(new GenericOpenAIProvider(providerConfig));
    }
  }

  if (providers.length === 0) {
    console.error('[error] No providers loaded. Exiting.');
    process.exit(1);
  }

  const router = createRouter(providers, config.defaultProvider, config.aliases ?? {});
  const server = createServer(router, config);

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
