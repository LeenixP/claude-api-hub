import http from 'http';
import { sendJson, sendError, maskKey } from '../utils/http.js';
import { getConfigPath, loadConfig, normalizeProviders } from '../config.js';
import { writeFileSync, renameSync } from 'fs';
import type { GatewayConfig, ProviderConfig } from '../providers/types.js';
import type { RouteContext } from './types.js';
import { logger } from '../logger.js';
import { readJson } from './helpers.js';
import { deepMerge } from '../utils/deep-merge.js';
import { isSSRFSafe } from '../utils/ssrf.js';

function saveConfig(config: GatewayConfig): void {
  const configPath = getConfigPath();
  const tmpPath = configPath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  renameSync(tmpPath, configPath);
}

export async function rebuildProviders(router: RouteContext['router'], config: GatewayConfig): Promise<void> {
  const { createProvider } = await import('../providers/factory.js');
  const { logger } = await import('../logger.js');
  normalizeProviders(config);
  // Destroy old provider pools
  for (const p of router.getProviders()) {
    const poolable = p as { pool?: { destroy?: () => void } };
    if (poolable.pool?.destroy) poolable.pool.destroy();
  }
  const providers = [];
  for (const [key, pc] of Object.entries(config.providers)) {
    if (!pc.enabled) continue;
    pc.key = key;
    try {
      const p = createProvider(pc);
      if (p) providers.push(p);
    } catch (err) {
      logger.warn(`Skipping provider "${pc.name}": ${(err as Error).message}`);
    }
  }
  router.replaceAll(providers);
}

export async function handleAdminConfigRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: RouteContext,
  pathname: string,
  cors: Record<string, string>,
  origin: string | undefined,
): Promise<boolean> {
  const { config, router } = ctx;

  if (req.method === 'GET' && pathname === '/api/config') {
    const masked: GatewayConfig = {
      ...config,
      providers: Object.fromEntries(
        Object.entries(config.providers).map(([key, p]) => [key, { ...p, apiKey: maskKey(p.apiKey) }]),
      ),
    };
    sendJson(res, 200, masked, config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/fetch-models') {
    const { httpGet } = await import('../services/forwarder.js');
    const results: Record<string, string[]> = {};
    const tasks = Object.entries(config.providers).map(async ([key, p]) => {
      if (!p.enabled || !p.apiKey) {
        results[p.name || key] = [...new Set([...(p.models || []), p.defaultModel].filter(Boolean))];
        return;
      }
      try {
        const parsed = new URL(p.baseUrl);
        if (!await isSSRFSafe(parsed.hostname)) {
          logger.warn(`Blocked fetch-models for ${p.name || key}: private IP detected`);
          results[p.name || key] = [...new Set([...(p.models || []), p.defaultModel].filter(Boolean))];
          return;
        }
      } catch {
        results[p.name || key] = [...new Set([...(p.models || []), p.defaultModel].filter(Boolean))];
        return;
      }
      try {
        const url = p.passthrough ? `${p.baseUrl}/v1/models` : `${p.baseUrl}/models`;
        const hdrs: Record<string, string> = p.passthrough
          ? { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' }
          : { 'Authorization': `Bearer ${p.apiKey}` };
        const body = await httpGet(url, hdrs);
        const json = JSON.parse(body);
        const fetched = (json.data || []).map((m: { id?: string }) => m.id).filter(Boolean) as string[];
        results[p.name || key] = [...new Set([...fetched, ...(p.models || []), p.defaultModel].filter(Boolean))];
      } catch (err) {
        logger.warn(`Failed to fetch models for ${p.name || key}: ${(err as Error).message}`);
        results[p.name || key] = [...new Set([...(p.models || []), p.defaultModel].filter(Boolean))];
      }
    });
    await Promise.all(tasks);
    sendJson(res, 200, results, config, origin);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/probe-models') {
    const { httpGet } = await import('../services/forwarder.js');
    const body = await readJson<{ baseUrl?: string; apiKey?: string; passthrough?: boolean }>(req, res, config);
    if (!body) return true;
    if (!body.baseUrl || !body.apiKey) {
      sendError(res, 400, 'invalid_request_error', 'Missing baseUrl or apiKey', config, origin); return true;
    }
    try {
      const parsed = new URL(body.baseUrl);
      if (!await isSSRFSafe(parsed.hostname)) {
        sendError(res, 400, 'invalid_request_error', 'baseUrl cannot point to private/internal networks', config, origin); return true;
      }
    } catch {
      sendError(res, 400, 'invalid_request_error', 'Invalid baseUrl format', config, origin); return true;
    }
    try {
      const url = body.passthrough ? `${body.baseUrl}/v1/models` : `${body.baseUrl}/models`;
      const hdrs: Record<string, string> = body.passthrough
        ? { 'x-api-key': body.apiKey, 'anthropic-version': '2023-06-01' }
        : { 'Authorization': `Bearer ${body.apiKey}` };
      const raw = await httpGet(url, hdrs, 10000);
      const json = JSON.parse(raw);
      const models = (json.data || []).map((m: { id?: string }) => m.id).filter(Boolean) as string[];
      sendJson(res, 200, { models }, config, origin);
    } catch {
      if (body.passthrough) {
        try {
          const fallbackUrl = body.baseUrl.replace(/\/anthropic\/?$/, '') + '/models';
          const raw = await httpGet(fallbackUrl, { 'Authorization': `Bearer ${body.apiKey}` }, 10000);
          const json = JSON.parse(raw);
          const models = (json.data || []).map((m: { id?: string }) => m.id).filter(Boolean) as string[];
          sendJson(res, 200, { models }, config, origin);
        } catch {
          sendJson(res, 200, { models: [], warning: 'This provider does not support model listing. Add models manually.' }, config, origin);
        }
      } else {
        sendJson(res, 200, { models: [], warning: 'Failed to fetch models. Add models manually.' }, config, origin);
      }
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/config/providers') {
    const body = await readJson<Partial<ProviderConfig> & { name?: string }>(req, res, config);
    if (!body) return true;
    const { name, baseUrl, apiKey, models, defaultModel, enabled } = body;
    const authMode = body.authMode as string | undefined;
    const isOAuth = authMode === 'oauth';
    if (models && Array.isArray(models) && models.length === 0) {
      sendError(res, 400, 'invalid_request_error', 'models array must not be empty', config, origin); return true;
    }
    if (!name || !baseUrl || (!isOAuth && !apiKey) || !models || !defaultModel) {
      sendError(res, 400, 'invalid_request_error', 'Missing required fields: name, baseUrl, apiKey (or authMode=oauth), models, defaultModel', config, origin); return true;
    }
    if (config.providers[name]) {
      sendError(res, 409, 'conflict_error', `Provider "${name}" already exists`, config, origin); return true;
    }
    try {
      const hostname = new URL(baseUrl).hostname;
      if (!await isSSRFSafe(hostname)) {
        sendError(res, 400, 'invalid_request_error', 'baseUrl points to a private/internal network address', config, origin); return true;
      }
    } catch {
      sendError(res, 400, 'invalid_request_error', 'Invalid baseUrl format', config, origin); return true;
    }
    const allowedFields = ['name', 'baseUrl', 'apiKey', 'models', 'defaultModel', 'enabled', 'prefix', 'passthrough', 'authMode', 'providerType', 'options'];
    const newProvider: ProviderConfig = { name, baseUrl, apiKey: apiKey || '', models, defaultModel, enabled: enabled ?? true };
    for (const [k, v] of Object.entries(body)) {
      if (allowedFields.includes(k) && !(k in newProvider)) {
        (newProvider as unknown as Record<string, unknown>)[k] = v;
      }
    }
    config.providers[name] = newProvider;
    saveConfig(config);
    await rebuildProviders(router, config);
    sendJson(res, 201, { ...newProvider, apiKey: maskKey(newProvider.apiKey) }, config, origin);
    return true;
  }

  const providerMatch = pathname.match(/^\/api\/config\/providers\/([^/]+)$/);
  if (providerMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
    const providerName = decodeURIComponent(providerMatch[1]);
    if (!config.providers[providerName]) {
      sendError(res, 404, 'not_found_error', `Provider "${providerName}" not found`, config, origin); return true;
    }
    if (req.method === 'DELETE') {
      delete config.providers[providerName];
      saveConfig(config);
      await rebuildProviders(router, config);
      sendJson(res, 200, { deleted: providerName }, config, origin);
      return true;
    }
    const updates = await readJson<Partial<ProviderConfig>>(req, res, config);
    if (!updates) return true;
    const allowedUpdateFields = ['name', 'baseUrl', 'apiKey', 'models', 'defaultModel', 'enabled', 'prefix', 'passthrough', 'authMode', 'providerType', 'options'];
    const filtered: Partial<ProviderConfig> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (allowedUpdateFields.includes(k)) {
        (filtered as unknown as Record<string, unknown>)[k] = v;
      }
    }
    // Preserve real API key if frontend sends masked value
    if (filtered.apiKey && filtered.apiKey.includes('***')) {
      delete filtered.apiKey;
    }
    const mergedProvider = { ...config.providers[providerName], ...filtered };
    if (mergedProvider.baseUrl) {
      try {
        const hostname = new URL(mergedProvider.baseUrl).hostname;
        if (!await isSSRFSafe(hostname)) {
          sendError(res, 400, 'invalid_request_error', 'baseUrl points to a private/internal network address', config, origin); return true;
        }
      } catch {
        sendError(res, 400, 'invalid_request_error', 'Invalid baseUrl format', config, origin); return true;
      }
    }
    config.providers[providerName] = { ...config.providers[providerName], ...filtered };
    saveConfig(config);
    await rebuildProviders(router, config);
    const updated = config.providers[providerName];
    sendJson(res, 200, { ...updated, apiKey: maskKey(updated.apiKey) }, config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/aliases') {
    sendJson(res, 200, config.aliases ?? {}, config, origin);
    return true;
  }

  if (req.method === 'PUT' && pathname === '/api/aliases') {
    const newAliases = await readJson<Record<string, string>>(req, res, config);
    if (!newAliases) return true;
    const validTiers = ['haiku', 'sonnet', 'opus'];
    const invalidKeys = Object.keys(newAliases).filter(k => !validTiers.includes(k));
    if (invalidKeys.length > 0) {
      sendError(res, 400, 'invalid_request_error', `Invalid alias keys: ${invalidKeys.join(', ')}. Only haiku, sonnet, opus are allowed.`, config, origin); return true;
    }
    config.aliases = newAliases;
    router.setAliases(newAliases);
    saveConfig(config);
    sendJson(res, 200, config.aliases, config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/tier-timeouts') {
    sendJson(res, 200, config.tierTimeouts ?? {}, config, origin);
    return true;
  }

  if (req.method === 'PUT' && pathname === '/api/tier-timeouts') {
    const newTimeouts = await readJson<Record<string, { timeoutMs: number; streamTimeoutMs?: number; streamIdleTimeoutMs?: number }>>(req, res, config);
    if (!newTimeouts) return true;
    const validTierKeys = ['haiku', 'sonnet', 'opus'];
    const invalidKeys = Object.keys(newTimeouts).filter(k => !validTierKeys.includes(k));
    if (invalidKeys.length > 0) {
      sendError(res, 400, 'invalid_request_error', `Invalid tier keys: ${invalidKeys.join(', ')}`, config, origin); return true;
    }
    config.tierTimeouts = newTimeouts;
    saveConfig(config);
    sendJson(res, 200, config.tierTimeouts, config, origin);
    return true;
  }

  if (req.method === 'POST' && (pathname === '/api/config' || pathname === '/api/config/import')) {
    const newConfig = await readJson<GatewayConfig>(req, res, config);
    if (!newConfig) return true;
    if (!newConfig.providers || typeof newConfig.providers !== 'object') {
      sendError(res, 400, 'invalid_request_error', 'Config must contain a providers object', config, origin); return true;
    }
    try {
      // Preserve real API keys when frontend sends masked values back
      if (newConfig.providers) {
        for (const [key, p] of Object.entries(newConfig.providers)) {
          if (p.apiKey && p.apiKey.includes('***') && config.providers[key]) {
            p.apiKey = config.providers[key].apiKey;
          }
        }
        // Validate all provider baseUrls for SSRF
        for (const [key, p] of Object.entries(newConfig.providers)) {
          if (p.baseUrl) {
            try {
              const hostname = new URL(p.baseUrl).hostname;
              if (!await isSSRFSafe(hostname)) {
                sendError(res, 400, 'invalid_request_error', `Provider "${key}": baseUrl points to a private/internal network address`, config, origin); return true;
              }
            } catch {
              sendError(res, 400, 'invalid_request_error', `Provider "${key}": Invalid baseUrl format`, config, origin); return true;
            }
          }
        }
      }
      const allowedConfigKeys = ['providers', 'aliases', 'tierTimeouts', 'defaultProvider', 'password', 'adminToken', 'corsOrigins', 'rateLimitRpm', 'logLevel', 'trustProxy', 'streamTimeoutMs', 'streamIdleTimeoutMs', 'maxResponseBytes', 'host', 'port', 'fallbackChain', 'tokenRefreshMinutes'];
      for (const key of allowedConfigKeys) {
        if (key in newConfig) {
          (config as unknown as Record<string, unknown>)[key] = (newConfig as unknown as Record<string, unknown>)[key];
        }
      }
      saveConfig(config);
      router.setAliases(config.aliases ?? {});
      await rebuildProviders(router, config);
      sendJson(res, 200, { imported: true }, config, origin);
    } catch (err) {
      sendError(res, 500, 'api_error', `Import failed: ${(err as Error).message}`, config, origin);
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/config/reload') {
    try {
      const fresh = loadConfig(getConfigPath());
      const merged = deepMerge(config as unknown as Record<string, unknown>, fresh as unknown as Record<string, unknown>);
      Object.assign(config, merged);
      router.setAliases(config.aliases ?? {});
      await rebuildProviders(router, config);
      const masked: GatewayConfig = {
        ...config,
        providers: Object.fromEntries(
          Object.entries(config.providers).map(([key, p]) => [key, { ...p, apiKey: maskKey(p.apiKey) }]),
        ),
      };
      sendJson(res, 200, { reloaded: true, config: masked }, config, origin);
    } catch (err) {
      sendError(res, 500, 'api_error', `Reload failed: ${(err as Error).message}`, config, origin);
    }
    return true;
  }

  return false;
}
