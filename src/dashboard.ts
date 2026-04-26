import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let cached: string | null = null;

const ICON_PATH = join(__dirname, '../static/icon.png');
let iconData: Buffer | null = null;

export function getIconData(): Buffer | null {
  if (iconData) return iconData;
  if (!existsSync(ICON_PATH)) return null;
  iconData = readFileSync(ICON_PATH);
  return iconData;
}

export function dashboardHtml(version: string = ''): string {
  if (!cached) {
    const htmlPath = join(__dirname, '../static/index.html');
    const cssPath = join(__dirname, '../static/style.css');
    const jsPath = join(__dirname, '../static/bundle.js');

    if (!existsSync(cssPath) || !existsSync(jsPath)) {
      logger.warn('Dashboard assets not found. Run `npm run build:ui` first.');
    }

    const html = readFileSync(htmlPath, 'utf-8');
    const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf-8') : '';
    const js = existsSync(jsPath) ? readFileSync(jsPath, 'utf-8') : '';

    cached = html
      .replace('<link rel="stylesheet" href="style.css">', () => '<style>' + css + '</style>')
      .replace('<script src="bundle.js"></script>', () => '<script>' + js + '</script>');
  }
  return cached.replace(/\{\{VERSION\}\}/g, version);
}

let cachedETag: string | null = null;

export function dashboardETag(): string {
  if (cachedETag) return cachedETag;
  const cssPath = join(__dirname, '../static/style.css');
  const jsPath = join(__dirname, '../static/bundle.js');
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf-8') : '';
  const js = existsSync(jsPath) ? readFileSync(jsPath, 'utf-8') : '';
  cachedETag = '"' + crypto.createHash('md5').update(css + js).digest('hex') + '"';
  return cachedETag;
}
