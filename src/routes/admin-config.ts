import http from 'http';
import crypto from 'crypto';
import { sendJson, sendError } from '../utils/http.js';
import { getErrorMessage } from '../utils/error.js';
import { getConfigPath, loadConfig, normalizeProviders } from '../config.js';
import { getAllowedConfigKeys } from '../config-schema.js';
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

async function validateBaseUrl(baseUrl: string, ssrfAllowlist?: string[]): Promise<string | null> {
  try { new URL(baseUrl); } catch { return 'Invalid baseUrl format'; }
  const hostname = new URL(baseUrl).hostname;
  if (!(await isSSRFSafe(hostname, ssrfAllowlist))) return 'baseUrl resolves to a private IP address';
  return null;
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
      const p = await createProvider(pc);
      if (p) providers.push(p);
    } catch (err) {
      logger.warn(`Skipping provider "${pc.name}": ${getErrorMessage(err)}`);
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
    await sendJson(res, 200, config, config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/fetch-models') {
    const { httpGet } = await import('../services/forwarder.js');
    const results: Record<string, string[]> = {};
    const tasks = Object.entries(config.providers).map(async ([key, p]) => {
      if (!p.enabled || !p.apiKey) {
        results[key] = [...new Set([...(p.models || []), p.defaultModel].filter(Boolean))];
        return;
      }
      try {
        const url = p.passthrough ? `${p.baseUrl}/v1/models` : `${p.baseUrl}/models`;
        const hdrs: Record<string, string> = p.passthrough
          ? { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' }
          : { 'Authorization': `Bearer ${p.apiKey}` };
        const body = await httpGet(url, hdrs, 5000, undefined, config.ssrfAllowlist);
        const json = JSON.parse(body);
        const fetched = (json.data || []).map((m: { id?: string }) => m.id).filter(Boolean) as string[];
        results[key] = [...new Set([...fetched, ...(p.models || []), p.defaultModel].filter(Boolean))];
      } catch (err) {
        logger.warn(`Failed to fetch models for ${p.name || key}: ${getErrorMessage(err)}`);
        results[key] = [...new Set([...(p.models || []), p.defaultModel].filter(Boolean))];
      }
    });
    await Promise.all(tasks);
    await sendJson(res, 200, results, config, origin);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/probe-models') {
    const { httpGet } = await import('../services/forwarder.js');
    const body = await readJson<{ baseUrl?: string; apiKey?: string; passthrough?: boolean }>(req, res, config);
    if (!body) return true;
    if (!body.baseUrl || !body.apiKey) {
      await sendError(res, 400, 'invalid_request_error', 'Missing baseUrl or apiKey', config, origin); return true;
    }
    const urlErr = await validateBaseUrl(body.baseUrl, config.ssrfAllowlist);
    if (urlErr) { await sendError(res, 400, 'invalid_request_error', urlErr, config, origin); return true; }
    try {
      const url = body.passthrough ? `${body.baseUrl}/v1/models` : `${body.baseUrl}/models`;
      const hdrs: Record<string, string> = body.passthrough
        ? { 'x-api-key': body.apiKey, 'anthropic-version': '2023-06-01' }
        : { 'Authorization': `Bearer ${body.apiKey}` };
      const raw = await httpGet(url, hdrs, 10000, undefined, config.ssrfAllowlist);
      const json = JSON.parse(raw);
      const models = (json.data || []).map((m: { id?: string }) => m.id).filter(Boolean) as string[];
      await sendJson(res, 200, { models }, config, origin);
    } catch {
      if (body.passthrough) {
        try {
          const fallbackUrl = body.baseUrl.replace(/\/anthropic\/?$/, '') + '/models';
          const raw = await httpGet(fallbackUrl, { 'Authorization': `Bearer ${body.apiKey}` }, 10000, undefined, config.ssrfAllowlist);
          const json = JSON.parse(raw);
          const models = (json.data || []).map((m: { id?: string }) => m.id).filter(Boolean) as string[];
          await sendJson(res, 200, { models }, config, origin);
        } catch {
          await sendJson(res, 200, { models: [], warning: 'This provider does not support model listing. Add models manually.' }, config, origin);
        }
      } else {
        await sendJson(res, 200, { models: [], warning: 'Failed to fetch models. Add models manually.' }, config, origin);
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
      await sendError(res, 400, 'invalid_request_error', 'models array must not be empty', config, origin); return true;
    }
    if (!name || !baseUrl || (!isOAuth && !apiKey) || !models || !defaultModel) {
      await sendError(res, 400, 'invalid_request_error', 'Missing required fields: name, baseUrl, apiKey (or authMode=oauth), models, defaultModel', config, origin); return true;
    }
    const urlErr = await validateBaseUrl(baseUrl, config.ssrfAllowlist);
    if (urlErr) { await sendError(res, 400, 'invalid_request_error', urlErr, config, origin); return true; }
    if (config.providers[name]) {
      await sendError(res, 409, 'conflict_error', `Provider "${name}" already exists`, config, origin); return true;
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
    await sendJson(res, 201, newProvider, config, origin);
    return true;
  }

  const providerMatch = pathname.match(/^\/api\/config\/providers\/([^/]+)$/);
  if (providerMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
    const providerName = decodeURIComponent(providerMatch[1]);
    if (!config.providers[providerName]) {
      await sendError(res, 404, 'not_found_error', `Provider "${providerName}" not found`, config, origin); return true;
    }
    if (req.method === 'DELETE') {
      delete config.providers[providerName];
      saveConfig(config);
      await rebuildProviders(router, config);
      await sendJson(res, 200, { deleted: providerName }, config, origin);
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
    if (filtered.baseUrl) {
      const urlErr = await validateBaseUrl(filtered.baseUrl, config.ssrfAllowlist);
      if (urlErr) { await sendError(res, 400, 'invalid_request_error', urlErr, config, origin); return true; }
    }
    const mergedProvider = { ...config.providers[providerName], ...filtered };
    config.providers[providerName] = { ...config.providers[providerName], ...filtered };
    saveConfig(config);
    await rebuildProviders(router, config);
    await sendJson(res, 200, config.providers[providerName], config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/aliases') {
    await sendJson(res, 200, config.aliases ?? {}, config, origin);
    return true;
  }

  if (req.method === 'PUT' && pathname === '/api/aliases') {
    const newAliases = await readJson<Record<string, string>>(req, res, config);
    if (!newAliases) return true;
    const validTiers = ['haiku', 'sonnet', 'opus'];
    const invalidKeys = Object.keys(newAliases).filter(k => !validTiers.includes(k));
    if (invalidKeys.length > 0) {
      await sendError(res, 400, 'invalid_request_error', `Invalid alias keys: ${invalidKeys.join(', ')}. Only haiku, sonnet, opus are allowed.`, config, origin); return true;
    }
    config.aliases = newAliases;
    router.setAliases(newAliases);
    saveConfig(config);
    await sendJson(res, 200, config.aliases, config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/tier-timeouts') {
    await sendJson(res, 200, config.tierTimeouts ?? {}, config, origin);
    return true;
  }

  if (req.method === 'PUT' && pathname === '/api/tier-timeouts') {
    const newTimeouts = await readJson<Record<string, { timeoutMs: number; streamTimeoutMs?: number; streamIdleTimeoutMs?: number }>>(req, res, config);
    if (!newTimeouts) return true;
    const validTierKeys = ['haiku', 'sonnet', 'opus'];
    const invalidKeys = Object.keys(newTimeouts).filter(k => !validTierKeys.includes(k));
    if (invalidKeys.length > 0) {
      await sendError(res, 400, 'invalid_request_error', `Invalid tier keys: ${invalidKeys.join(', ')}`, config, origin); return true;
    }
    config.tierTimeouts = newTimeouts;
    saveConfig(config);
    await sendJson(res, 200, config.tierTimeouts, config, origin);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/generate-key') {
    const key = 'sk-hub-' + crypto.randomBytes(24).toString('hex');
    config.proxyApiKey = key;
    saveConfig(config);
    logger.info('Proxy API key generated');
    await sendJson(res, 200, { key }, config, origin);
    return true;
  }

  if (req.method === 'DELETE' && pathname === '/api/proxy-key') {
    delete (config as unknown as Record<string, unknown>).proxyApiKey;
    saveConfig(config);
    logger.info('Proxy API key revoked');
    await sendJson(res, 200, { revoked: true }, config, origin);
    return true;
  }

  if (req.method === 'POST' && (pathname === '/api/config' || pathname === '/api/config/import')) {
    const newConfig = await readJson<GatewayConfig>(req, res, config);
    if (!newConfig) return true;
    if (!newConfig.providers || typeof newConfig.providers !== 'object') {
      await sendError(res, 400, 'invalid_request_error', 'Config must contain a providers object', config, origin); return true;
    }
    for (const [, p] of Object.entries(newConfig.providers)) {
      if (p.baseUrl) {
        const urlErr = await validateBaseUrl(p.baseUrl, config.ssrfAllowlist);
        if (urlErr) { await sendError(res, 400, 'invalid_request_error', urlErr, config, origin); return true; }
      }
    }
    try {
      const allowedConfigKeys = getAllowedConfigKeys();
      for (const key of allowedConfigKeys) {
        if (key in newConfig) {
          (config as unknown as Record<string, unknown>)[key] = (newConfig as unknown as Record<string, unknown>)[key];
        }
      }
      // Hash password if it was changed to a plaintext value
      if (config.password && !config.password.includes(':')) {
        const { hashPassword } = await import('../middleware/auth.js');
        config.password = await hashPassword(config.password);
      }
      saveConfig(config);
      router.setAliases(config.aliases ?? {});
      await rebuildProviders(router, config);
      await sendJson(res, 200, { imported: true }, config, origin);
    } catch (err) {
      await sendError(res, 500, 'api_error', `Import failed: ${getErrorMessage(err)}`, config, origin);
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/config/reload') {
    try {
      const fresh = await loadConfig(getConfigPath());
      const merged = deepMerge(config as unknown as Record<string, unknown>, fresh as unknown as Record<string, unknown>);
      Object.assign(config, merged);
      router.setAliases(config.aliases ?? {});
      await rebuildProviders(router, config);
      await sendJson(res, 200, { reloaded: true, config }, config, origin);
    } catch (err) {
      await sendError(res, 500, 'api_error', `Reload failed: ${getErrorMessage(err)}`, config, origin);
    }
    return true;
  }

  return false;
}
