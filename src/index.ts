#!/usr/bin/env node
import { loadConfig } from './config.js';
import { createRouter } from './router.js';
import { createServer } from './server.js';
import { Provider } from './providers/types.js';
import { ClaudeProvider } from './providers/claude.js';
import { GenericOpenAIProvider } from './providers/generic.js';

async function main(): Promise<void> {
  const config = loadConfig();

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
  const server = createServer(router);

  server.listen(config.port, config.host, () => {
    console.log(`[info] claude-api-hub listening on http://${config.host}:${config.port}`);
    console.log(`[info] Providers: ${providers.map(p => p.name).join(', ')}`);
    if (config.aliases) {
      const aliasStr = Object.entries(config.aliases).map(([k, v]) => `${k}→${v}`).join(', ');
      console.log(`[info] Aliases: ${aliasStr}`);
    }
  });

  process.on('SIGINT', () => { server.close(); process.exit(0); });
  process.on('SIGTERM', () => { server.close(); process.exit(0); });
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
