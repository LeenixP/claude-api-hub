import http from 'http';
import os from 'os';
import process from 'process';
import { execFile } from 'child_process';
import { spawn } from 'child_process';
import type { RouteContext } from './types.js';
import { getInstallInfo, getRestartInfo, saveRestartInfo } from '../install-info.js';
import { backupConfig, restoreConfig } from '../config.js';
import { logger } from '../logger.js';
import { getErrorMessage } from '../utils/error.js';

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

let updateInProgress = false;

export async function handleSystemRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: RouteContext,
  pathname: string,
  cors: Record<string, string>,
): Promise<boolean> {
  if (pathname === '/api/system-info' && req.method === 'GET') {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const installInfo = getInstallInfo();
    const body = JSON.stringify({
      localVersion: ctx.config.version || 'unknown',
      uptime: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.release()}`,
      memoryUsage: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
      },
      cpuUsage: {
        user: cpu.user,
        system: cpu.system,
      },
      processPid: process.pid,
      serverTime: new Date().toISOString(),
      installMethod: installInfo?.method || 'unknown',
    });
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(body);
    return true;
  }

  if (pathname === '/api/check-update' && req.method === 'GET') {
    const localVersion = ctx.config.version || 'unknown';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const fetchRes = await fetch('https://registry.npmjs.org/claude-api-hub/latest', {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!fetchRes.ok) {
        throw new Error(`npm registry returned ${fetchRes.status}`);
      }
      const data = await fetchRes.json() as { version?: string };
      const latestVersion = data.version || null;
      const hasUpdate = latestVersion ? compareSemver(latestVersion, localVersion) > 0 : false;
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ localVersion, latestVersion, hasUpdate }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({
        localVersion,
        latestVersion: null,
        hasUpdate: false,
        error: getErrorMessage(err),
      }));
    }
    return true;
  }

  if (pathname === '/api/update' && req.method === 'POST') {
    if (updateInProgress) {
      res.writeHead(409, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ success: false, error: 'Update already in progress' }));
      return true;
    }

    const installInfo = getInstallInfo();
    if (!installInfo) {
      res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ success: false, error: 'Install method not detected. Please restart the service.' }));
      return true;
    }

    updateInProgress = true;
    const oldVersion = ctx.config.version || 'unknown';

    try {
      // Save restart info and backup config before updating
      saveRestartInfo();
      backupConfig();

      const isGlobal = installInfo.method === 'global';
      const npmArgs = isGlobal
        ? ['install', '-g', 'claude-api-hub@latest']
        : ['install', 'claude-api-hub@latest'];

      const npmOptions: { cwd?: string } = {};
      if (!isGlobal) {
        // For local installs, run in the package parent directory
        const pkgDir = installInfo.packageDir;
        // Go up from dist/ to the project root
        npmOptions.cwd = pkgDir.replace(/\/dist$/, '') || pkgDir;
      }

      const stdout = await new Promise<string>((resolve, reject) => {
        execFile('npm', npmArgs, {
          ...npmOptions,
          timeout: 120000,
          maxBuffer: 1024 * 1024,
        }, (err, stdout, stderr) => {
          if (err) {
            reject(new Error(getErrorMessage(err)));
            return;
          }
          resolve(stdout);
        });
      });

      // Extract new version from npm output
      const versionMatch = stdout.match(/claude-api-hub@(\d+\.\d+\.\d+)/);
      const newVersion = versionMatch ? versionMatch[1] : 'unknown';

      logger.info(`Update completed: ${oldVersion} → ${newVersion}`);
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ success: true, oldVersion, newVersion, output: stdout }));
    } catch (err) {
      logger.error(`Update failed: ${getErrorMessage(err)}`);
      restoreConfig();
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ success: false, oldVersion, newVersion: null, error: getErrorMessage(err) }));
    } finally {
      updateInProgress = false;
    }
    return true;
  }

  if (pathname === '/api/restart' && req.method === 'POST') {
    logger.info('Restart requested via API');

    // Send response before restarting
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ restarting: true }));

    // Small delay to ensure response is sent
    setTimeout(() => {
      try {
        const restartInfo = getRestartInfo();
        const args = restartInfo ? restartInfo.argv.slice(1) : process.argv.slice(1);
        const execPath = restartInfo?.execPath || process.execPath;
        const cwd = restartInfo?.cwd || process.cwd();

        const child = spawn(execPath, args, {
          cwd,
          detached: true,
          stdio: 'ignore',
          env: { ...process.env },
        });
        child.unref();

        logger.info(`Spawned replacement process (PID ${child.pid}), exiting...`);
        process.exit(0);
      } catch (err) {
        logger.error(`Failed to restart: ${getErrorMessage(err)}`);
      }
    }, 500);

    return true;
  }

  return false;
}
