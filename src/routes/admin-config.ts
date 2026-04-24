import http from 'http';
import { sendJson, sendError, readBody, maskKey } from '../utils/http.js';
import { getConfigPath, loadConfig } from '../config.js';
import { writeFileSync, renameSync } from 'fs';
import type { GatewayConfig, ProviderConfig } from '../providers/types.js';
import type { RouteContext } from './types.js';

function saveConfig(config: GatewayConfig): void {
  const configPath = getConfigPath();
  const tmpPath = configPath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  renameSync(tmpPath, configPath);
}

export async function rebuildProviders(router: RouteContext['router'], config: GatewayConfig): Promise<void> {
  const { createProvider } = await import('../providers/factory.js');
  const { logger } = await import('../logger.js');
  const providers = [];
  for (const [, pc] of Object.entries(config.providers)) {
    if (!pc.enabled) continue;
    try {
      providers.push(createProvider(pc));
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
    let bodyStr: string;
    try { bodyStr = await readBody(req); } catch {
      sendError(res, 400, 'invalid_request_error', 'Failed to read request body', config, origin); return true;
    }
    let body: { baseUrl?: string; apiKey?: string; passthrough?: boolean };
    try { body = JSON.parse(bodyStr); } catch {
      sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config, origin); return true;
    }
    if (!body.baseUrl || !body.apiKey) {
      sendError(res, 400, 'invalid_request_error', 'Missing baseUrl or apiKey', config, origin); return true;
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
    let bodyStr: string;
    try { bodyStr = await readBody(req); } catch {
      sendError(res, 400, 'invalid_request_error', 'Failed to read request body', config, origin); return true;
    }
    let body: Partial<ProviderConfig> & { name?: string };
    try { body = JSON.parse(bodyStr); } catch {
      sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config, origin); return true;
    }
    const { name, baseUrl, apiKey, models, defaultModel, enabled } = body;
    const authMode = body.authMode as string | undefined;
    const isOAuth = authMode === 'oauth';
    if (!name || !baseUrl || (!isOAuth && !apiKey) || !models || !defaultModel) {
      sendError(res, 400, 'invalid_request_error', 'Missing required fields: name, baseUrl, apiKey (or authMode=oauth), models, defaultModel', config, origin); return true;
    }
    if (config.providers[name]) {
      sendError(res, 409, 'conflict_error', `Provider "${name}" already exists`, config, origin); return true;
    }
    const allowedFields = ['name', 'baseUrl', 'apiKey', 'models', 'defaultModel', 'enabled', 'prefix', 'passthrough', 'authMode', 'providerType', 'kiroAuthMethod', 'kiroRegion', 'kiroCredsPath', 'kiroStartUrl'];
    const newProvider: ProviderConfig = { name, baseUrl, apiKey: apiKey || '', models, defaultModel, enabled: enabled ?? true };
    for (const [k, v] of Object.entries(body)) {
      if (allowedFields.includes(k) && !(k in newProvider)) {
        (newProvider as unknown as Record<string, unknown>)[k] = v;
      }
    }
    config.providers[name] = newProvider;
    saveConfig(config);
    rebuildProviders(router, config);
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
      rebuildProviders(router, config);
      sendJson(res, 200, { deleted: providerName }, config, origin);
      return true;
    }
    let bodyStr: string;
    try { bodyStr = await readBody(req); } catch {
      sendError(res, 400, 'invalid_request_error', 'Failed to read request body', config, origin); return true;
    }
    let updates: Partial<ProviderConfig>;
    try { updates = JSON.parse(bodyStr); } catch {
      sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config, origin); return true;
    }
    const allowedUpdateFields = ['name', 'baseUrl', 'apiKey', 'models', 'defaultModel', 'enabled', 'prefix', 'passthrough', 'authMode', 'providerType', 'kiroAuthMethod', 'kiroRegion', 'kiroCredsPath', 'kiroStartUrl'];
    const filtered: Partial<ProviderConfig> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (allowedUpdateFields.includes(k)) {
        (filtered as unknown as Record<string, unknown>)[k] = v;
      }
    }
    config.providers[providerName] = { ...config.providers[providerName], ...filtered };
    saveConfig(config);
    rebuildProviders(router, config);
    const updated = config.providers[providerName];
    sendJson(res, 200, { ...updated, apiKey: maskKey(updated.apiKey) }, config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/aliases') {
    sendJson(res, 200, config.aliases ?? {}, config, origin);
    return true;
  }

  if (req.method === 'PUT' && pathname === '/api/aliases') {
    let bodyStr: string;
    try { bodyStr = await readBody(req); } catch {
      sendError(res, 400, 'invalid_request_error', 'Failed to read request body', config, origin); return true;
    }
    let newAliases: Record<string, string>;
    try { newAliases = JSON.parse(bodyStr); } catch {
      sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config, origin); return true;
    }
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
    let bodyStr: string;
    try { bodyStr = await readBody(req); } catch {
      sendError(res, 400, 'invalid_request_error', 'Failed to read request body', config, origin); return true;
    }
    let newTimeouts: Record<string, { timeoutMs: number; streamTimeoutMs?: number; streamIdleTimeoutMs?: number }>;
    try { newTimeouts = JSON.parse(bodyStr); } catch {
      sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config, origin); return true;
    }
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
    let bodyStr: string;
    try { bodyStr = await readBody(req); } catch {
      sendError(res, 400, 'invalid_request_error', 'Failed to read request body', config, origin); return true;
    }
    let newConfig: GatewayConfig;
    try { newConfig = JSON.parse(bodyStr); } catch {
      sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config, origin); return true;
    }
    if (!newConfig.providers || typeof newConfig.providers !== 'object') {
      sendError(res, 400, 'invalid_request_error', 'Config must contain a providers object', config, origin); return true;
    }
    try {
      Object.assign(config, newConfig);
      saveConfig(config);
      router.setAliases(config.aliases ?? {});
      rebuildProviders(router, config);
      sendJson(res, 200, { imported: true }, config, origin);
    } catch (err) {
      sendError(res, 500, 'api_error', `Import failed: ${(err as Error).message}`, config, origin);
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/config/reload') {
    try {
      const fresh = loadConfig(getConfigPath());
      Object.assign(config, fresh);
      router.setAliases(config.aliases ?? {});
      rebuildProviders(router, config);
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

import { logger } from '../logger.js';
