#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const staticDir = join(root, 'static');
const srcUiDir = join(root, 'src-ui');

const isWatch = process.argv.includes('--watch');

mkdirSync(staticDir, { recursive: true });

// 1. Build CSS with Tailwind v4 CLI
console.log('[build:ui] Compiling Tailwind CSS...');
const cssArgs = [join(root, 'node_modules/@tailwindcss/cli/dist/index.mjs'), '-i', join(srcUiDir, 'styles.css'), '-o', join(staticDir, 'style.css')];
if (!isWatch) cssArgs.push('--minify');
try {
  execFileSync('node', cssArgs, { cwd: root, stdio: 'inherit' });
} catch {
  console.log('[build:ui] Tailwind CSS compilation failed, using fallback...');
}

// 2. Build JS with esbuild
console.log('[build:ui] Bundling Preact app with esbuild...');
const entryPoint = join(srcUiDir, 'main.tsx');
const outfile = join(staticDir, 'bundle.js');

const esbuildArgs = [
  'esbuild',
  entryPoint,
  '--bundle',
  '--outfile=' + outfile,
  '--minify',
  '--format=iife',
  '--target=es2022',
  '--jsx=automatic',
  '--jsx-import-source=preact',
  '--define:process.env.NODE_ENV="production"',
  '--external:fs',
  '--external:path',
  '--external:http',
  '--external:crypto',
];

if (isWatch) {
  esbuildArgs.push('--watch');
}

try {
  execFileSync('npx', esbuildArgs, { cwd: root, stdio: 'inherit' });
} catch (err) {
  console.error('[build:ui] esbuild failed:', err.message);
  process.exit(1);
}

console.log('[build:ui] Done.');
