import type { ModelRouter } from '../router.js';
import type { GatewayConfig } from '../providers/types.js';
import type { LogManager } from '../services/log-manager.js';
import type { EventBus } from '../services/event-bus.js';
import type { RateTracker } from '../services/rate-tracker.js';
import type http from 'http';

export interface RouteContext {
  router: ModelRouter;
  config: GatewayConfig;
  logManager: LogManager;
  eventBus?: EventBus;
  rateTracker?: RateTracker;
}

export type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse, ctx: RouteContext) => Promise<void>;
