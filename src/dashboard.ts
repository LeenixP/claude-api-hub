import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let cached: string | null = null;

export function dashboardHtml(version: string = ''): string {
  if (!cached) {
    const html = readFileSync(join(__dirname, '../static/index.html'), 'utf-8');
    const css = readFileSync(join(__dirname, '../static/style.css'), 'utf-8');
    const js = readFileSync(join(__dirname, '../static/app.js'), 'utf-8');
    cached = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>').replace('<script src="app.js"></script>', '<script>' + js + '</script>');
  }
  return cached.replace(/\{\{VERSION\}\}/g, version);
}
