import http from 'http';
import https from 'https';
import { URL } from 'url';
import { MAX_RESPONSE_SIZE, MAX_GET_SIZE, KEEP_ALIVE_MAX_SOCKETS } from '../constants.js';
import { isSSRFSafe } from '../utils/ssrf.js';

const MAX_AGENT_POOL_SIZE = 50;

const agentPool = new Map<string, http.Agent | https.Agent>();
const agentPoolOrder: string[] = [];

function getAgent(parsed: URL): http.Agent | https.Agent {
  const host = parsed.hostname;
  const isHttps = parsed.protocol === 'https:';
  const key = `${isHttps ? 'https' : 'http'}:${host}`;
  const cached = agentPool.get(key);
  if (cached) return cached;

  // Evict oldest agent if pool is at capacity
  if (agentPool.size >= MAX_AGENT_POOL_SIZE && agentPoolOrder.length > 0) {
    const oldestKey = agentPoolOrder.shift()!;
    const oldestAgent = agentPool.get(oldestKey);
    if (oldestAgent) {
      oldestAgent.destroy();
      agentPool.delete(oldestKey);
    }
  }

  const agent = isHttps
    ? new https.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: KEEP_ALIVE_MAX_SOCKETS })
    : new http.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: KEEP_ALIVE_MAX_SOCKETS });
  agentPool.set(key, agent);
  agentPoolOrder.push(key);
  return agent;
}

export function destroyAgents(): void {
  for (const agent of agentPool.values()) {
    agent.destroy();
  }
  agentPool.clear();
  agentPoolOrder.length = 0;
}

export async function forwardRequest(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs = 120000,
  maxResponseBytes = MAX_RESPONSE_SIZE,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  const parsed = new URL(url);
  if (!await isSSRFSafe(parsed.hostname)) {
    throw new Error(`SSRF: blocked request to private address ${parsed.hostname}`);
  }
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs,
      agent: getAgent(parsed),
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxResponseBytes) {
          res.destroy();
          reject(new Error(`Upstream response exceeds ${maxResponseBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 500,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf-8'),
        });
      });
      res.on('error', reject);
    });

    req.on('timeout', () => { req.destroy(); reject(new Error(`Upstream timeout after ${timeoutMs}ms`)); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function httpGet(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 5000,
  maxResponseBytes = MAX_GET_SIZE,
): Promise<string> {
  const parsed = new URL(url);
  if (!await isSSRFSafe(parsed.hostname)) {
    throw new Error(`SSRF: blocked request to private address ${parsed.hostname}`);
  }
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
      timeout: timeoutMs,
      agent: getAgent(parsed),
    };
    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxResponseBytes) { res.destroy(); reject(new Error(`Response exceeds ${maxResponseBytes} bytes`)); return; }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

export async function forwardStream(
  url: string,
  headers: Record<string, string>,
  body: string,
  onChunk: (chunk: string) => boolean | void,
  onEnd: () => void,
  onError: (err: Error) => void,
  onUpstreamResponse?: (statusCode: number, headers: http.IncomingHttpHeaders, rawBody?: string) => void,
  connectTimeoutMs = 30000,
  idleTimeoutMs = 60000,
  downstreamRes?: http.ServerResponse,
): Promise<void> {
  const parsed = new URL(url);
  if (!await isSSRFSafe(parsed.hostname)) {
    onError(new Error(`SSRF: blocked request to private address ${parsed.hostname}`));
    return;
  }
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options: http.RequestOptions = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'POST',
    headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    timeout: connectTimeoutMs,
    agent: getAgent(parsed),
  };

  const req = lib.request(options, (upstreamRes) => {
    const statusCode = upstreamRes.statusCode ?? 502;

    if (statusCode !== 200) {
      const chunks: Buffer[] = [];
      upstreamRes.on('data', (c: Buffer) => chunks.push(c));
      upstreamRes.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf-8');
        if (onUpstreamResponse) onUpstreamResponse(statusCode, upstreamRes.headers, rawBody);
      });
      upstreamRes.on('error', onError);
      return;
    }

    if (onUpstreamResponse) onUpstreamResponse(200, upstreamRes.headers);

    let idleTimer: NodeJS.Timeout | null = null;
    let paused = false;
    function resetIdleTimer() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        upstreamRes.destroy(new Error(`Stream idle timeout: no data for ${idleTimeoutMs}ms`));
      }, idleTimeoutMs);
    }
    resetIdleTimer();

    upstreamRes.on('data', (chunk: Buffer) => {
      resetIdleTimer();
      const ok = onChunk(chunk.toString('utf-8'));
      if (ok === false && downstreamRes && !paused) {
        paused = true;
        upstreamRes.pause();
        downstreamRes.once('drain', () => {
          paused = false;
          upstreamRes.resume();
        });
      }
    });
    upstreamRes.on('end', () => { if (idleTimer) clearTimeout(idleTimer); onEnd(); });
    upstreamRes.on('error', (err) => { if (idleTimer) clearTimeout(idleTimer); onError(err); });
  });

  req.on('timeout', () => {
    req.destroy();
    onError(new Error(`Stream connection timeout after ${connectTimeoutMs}ms`));
  });
  req.on('error', onError);
  req.write(body);
  req.end();
}
