#!/usr/bin/env node
// DProject — single-file bundle builder.
//
//   node build.mjs
//
// Output:
//   dist/dproject.js       — concatenated source, browser-friendly IIFE wrapper
//   dist/dproject.min.js   — terser-minified
//   dist/dproject.min.js.gz — gzipped (size check)
//
// No DPlan-style "_deploy" output — this is a standalone library bundle.
//
// Bundle gates (Gate 7):
//   minified  ≤ 50 KB
//   gzipped   ≤ 18 KB

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { gzipSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const DIST = join(ROOT, 'dist');

if (!existsSync(DIST)) mkdirSync(DIST);

// Load order matters: types first, then xml/parser/normalizer/validator, then entry.
const FILES = [
  'src/types/coerce.js',
  'src/types/fields.js',
  'src/xml.js',
  'src/parser.js',
  'src/normalizer.js',
  'src/validator.js',
  'src/serializer.js',
  'dproject.js',
];

const HEADER = `/*!
 * DProject v${JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).version} — MS Project (MSPDI XML) reader for JS/TS
 * https://github.com/Dharmesh2015/dplan-source/tree/main/DPlan/dproject
 * Copyright (c) 2026 Dharmesh Patel — MIT License
 */
`;

// ── Step 1: concatenate ──────────────────────────────────────────────────────
const parts = [HEADER, '(function(global){', '"use strict";'];

// Provide a host stub: when bundled, "require" is undefined, so each file's
// (typeof require !== 'undefined') check naturally falls through to the
// `window` branch. We give it a window shim that aliases to the global.
parts.push('var window = global;');
parts.push('var module = undefined;');

for (const f of FILES) {
  const src = readFileSync(join(ROOT, f), 'utf-8');
  parts.push('// ── ' + f + ' ──');
  // Per-file IIFE: each src/* file declares helpers (getChild, etc.) that
  // would otherwise collide across files. The window.* exports survive.
  parts.push('(function(){');
  parts.push(src);
  parts.push('})();');
}
// Final: re-export onto whichever global the consumer is using.
parts.push('if (typeof globalThis !== "undefined") globalThis.DProject = window.DProject;');
parts.push('})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : this)));');

const bundled = parts.join('\n');
writeFileSync(join(DIST, 'dproject.js'), bundled);
const rawSize = Buffer.byteLength(bundled, 'utf-8');
console.log('  Concatenated   : ' + (rawSize / 1024).toFixed(2) + ' KB');

// ── Step 2: terser minify ────────────────────────────────────────────────────
let minSize = 0, gzSize = 0;
try {
  const terserPath = join('/Users/apple/Desktop/Development/ALGO', 'node_modules', 'terser', 'dist', 'bundle.min.js');
  const terserMod = await import(terserPath);
  const minify = terserMod.minify || (terserMod.default && terserMod.default.minify);
  if (typeof minify !== 'function') throw new Error('terser.minify not found');
  const result = await minify(bundled, {
    compress: { passes: 2, drop_console: false, drop_debugger: true },
    mangle: { reserved: ['DProject'] },
    format: { comments: /^!/ },
  });
  if (result.error) throw result.error;
  writeFileSync(join(DIST, 'dproject.min.js'), result.code);
  minSize = Buffer.byteLength(result.code, 'utf-8');
  console.log('  Minified       : ' + (minSize / 1024).toFixed(2) + ' KB');

  const gz = gzipSync(Buffer.from(result.code, 'utf-8'), { level: 9 });
  writeFileSync(join(DIST, 'dproject.min.js.gz'), gz);
  gzSize = gz.length;
  console.log('  Gzipped        : ' + (gzSize / 1024).toFixed(2) + ' KB');
} catch (e) {
  console.error('Terser minify failed: ' + e.message);
  process.exit(1);
}

// ── Step 3: gates ────────────────────────────────────────────────────────────
console.log('\n  [Gate 7 — bundle size]');
const minOk = minSize <= 50 * 1024;
const gzOk  = gzSize  <= 18 * 1024;
console.log('  ' + (minOk ? '✅' : '❌') + '  minified  ' + (minSize / 1024).toFixed(2) + ' KB ≤ 50 KB');
console.log('  ' + (gzOk  ? '✅' : '❌') + '  gzipped   ' + (gzSize  / 1024).toFixed(2) + ' KB ≤ 18 KB');

if (!minOk || !gzOk) {
  console.error('\n  ⛔ Bundle exceeds size budget');
  process.exit(1);
}
console.log('\n  ✅ Build OK — wrote dist/dproject.js, dist/dproject.min.js, dist/dproject.min.js.gz');
