import type { ModelRouter } from '../router.js';
import type { GatewayConfig, ProviderConfig } from '../providers/types.js';
import { refreshCredentials, getCredentialStatus, getDefaultCredsPath } from '../providers/kiro-oauth.js';
import { logger } from '../logger.js';

export class TokenRefresher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private router: ModelRouter;
  private config: GatewayConfig;
  private rebuildFn: (router: ModelRouter, config: GatewayConfig) => void;
  private intervalMs: number;

  constructor(
    router: ModelRouter,
    config: GatewayConfig,
    rebuildFn: (router: ModelRouter, config: GatewayConfig) => void,
    intervalMinutes = 50,
  ) {
    this.router = router;
    this.config = config;
    this.rebuildFn = rebuildFn;
    this.intervalMs = intervalMinutes * 60 * 1000;
  }

  start(): void {
    if (this.timer) return;
    logger.info(`[TokenRefresher] Starting (interval: ${this.intervalMs / 60000}min)`);
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    // Run first check after 1 minute
    setTimeout(() => this.tick(), 60 * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[TokenRefresher] Stopped');
    }
  }

  private async tick(): Promise<void> {
    const oauthProviders = Object.entries(this.config.providers)
      .filter((entry): entry is [string, ProviderConfig] => {
        const pc = entry[1] as ProviderConfig;
        return pc.enabled && pc.authMode === 'oauth';
      });

    if (oauthProviders.length === 0) return;

    let refreshed = 0;
    for (const [key, pc] of oauthProviders) {
      const credsPath = pc.kiroCredsPath || getDefaultCredsPath();
      try {
        const status = getCredentialStatus(credsPath);
        if (!status.canRefresh) continue;

        // Refresh if expired or within 10 minutes of expiry
        const expiresAt = status.expiresAt ? new Date(status.expiresAt).getTime() : 0;
        const buffer = 10 * 60 * 1000; // 10 min
        if (Date.now() > expiresAt - buffer) {
          logger.info(`[TokenRefresher] Refreshing credentials for "${pc.name}" (${credsPath})`);
          await refreshCredentials(credsPath);
          refreshed++;
        }
      } catch (err) {
        logger.warn(`[TokenRefresher] Failed to refresh "${pc.name}": ${(err as Error).message}`);
      }
    }

    // Rebuild providers to pick up fresh tokens
    if (refreshed > 0) {
      try {
        this.rebuildFn(this.router, this.config);
        logger.info(`[TokenRefresher] Refreshed ${refreshed} credential(s), providers rebuilt`);
      } catch (err) {
        logger.error(`[TokenRefresher] Rebuild failed: ${(err as Error).message}`);
      }
    }
  }
}
