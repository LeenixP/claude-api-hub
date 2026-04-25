import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HUB_DIR = join(homedir(), '.claude-api-hub');
const INSTALL_INFO_PATH = join(HUB_DIR, 'install-info.json');
const RESTART_INFO_PATH = join(HUB_DIR, 'restart-info.json');

export interface InstallInfo {
  method: 'global' | 'local';
  detectedAt: string;
  npmPrefix: string;
  packageDir: string;
}

export interface RestartInfo {
  argv: string[];
  execPath: string;
  cwd: string;
}

function ensureHubDir(): void {
  if (!existsSync(HUB_DIR)) {
    mkdirSync(HUB_DIR, { recursive: true });
  }
}

export function detectInstallMethod(): InstallInfo {
  ensureHubDir();

  // Return cached result if available
  if (existsSync(INSTALL_INFO_PATH)) {
    try {
      const cached = JSON.parse(readFileSync(INSTALL_INFO_PATH, 'utf-8')) as InstallInfo;
      if (cached.method && cached.npmPrefix) return cached;
    } catch { /* re-detect */ }
  }

  // Detect: compare __dirname against npm global prefix
  let method: 'global' | 'local' = 'local';
  let npmPrefix = '';

  try {
    npmPrefix = execSync('npm prefix -g', { encoding: 'utf-8' }).trim();
    // __dirname is dist/ inside the package. Global installs go to <prefix>/lib/node_modules/claude-api-hub/dist
    const globalPkgDir = join(npmPrefix, 'lib', 'node_modules', 'claude-api-hub');
    if (__dirname.startsWith(globalPkgDir) || __dirname.startsWith(join(npmPrefix, 'node_modules', 'claude-api-hub'))) {
      method = 'global';
    }
  } catch {
    // Fallback: check common global paths
    const globalPaths = [
      '/usr/local/lib/node_modules/claude-api-hub',
      '/usr/lib/node_modules/claude-api-hub',
      join(homedir(), '.npm-global/lib/node_modules/claude-api-hub'),
      join(homedir(), '.nvm/versions/node', process.version, 'lib/node_modules/claude-api-hub'),
    ];
    for (const p of globalPaths) {
      if (__dirname.startsWith(p)) {
        method = 'global';
        npmPrefix = p.split('/lib/node_modules')[0] || p.split('/node_modules')[0];
        break;
      }
    }
  }

  const info: InstallInfo = {
    method,
    detectedAt: new Date().toISOString(),
    npmPrefix,
    packageDir: __dirname,
  };

  try {
    writeFileSync(INSTALL_INFO_PATH, JSON.stringify(info, null, 2), 'utf-8');
    logger.info(`Install method detected: ${method} (prefix: ${npmPrefix || 'unknown'})`);
  } catch (err) {
    logger.warn(`Failed to save install info: ${(err as Error).message}`);
  }

  return info;
}

export function getInstallInfo(): InstallInfo | null {
  try {
    if (existsSync(INSTALL_INFO_PATH)) {
      return JSON.parse(readFileSync(INSTALL_INFO_PATH, 'utf-8')) as InstallInfo;
    }
  } catch { /* ignore */ }
  return null;
}

export function saveRestartInfo(): void {
  ensureHubDir();
  const info: RestartInfo = {
    argv: process.argv,
    execPath: process.execPath,
    cwd: process.cwd(),
  };
  try {
    writeFileSync(RESTART_INFO_PATH, JSON.stringify(info, null, 2), 'utf-8');
  } catch (err) {
    logger.warn(`Failed to save restart info: ${(err as Error).message}`);
  }
}

export function getRestartInfo(): RestartInfo | null {
  try {
    if (existsSync(RESTART_INFO_PATH)) {
      return JSON.parse(readFileSync(RESTART_INFO_PATH, 'utf-8')) as RestartInfo;
    }
  } catch { /* ignore */ }
  return null;
}
