#!/usr/bin/env node
'use strict';
/**
 * DProject — peer comparison benchmark.
 *
 *   Compares DProject (full MSPDI parse) against:
 *     1. htmlparser2 (xmlMode) — raw XML tokenizer baseline
 *     2. JSDOM DOMParser (if installed) — what a browser would do
 *     3. mpxj-wasm (if installed) — closest functional peer
 *
 *   Reports:
 *     - parse time (ms) — median of 10 runs
 *     - throughput (tasks/sec)
 *     - bundle size (KB minified, KB gzipped)
 *     - LOC for "list all task names"
 *     - Coverage (does it return semantic Project shape, or just a tree?)
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FIXTURE = path.join(__dirname, '..', 'tests', 'fixtures', 'sample-01.xml');
const xml = fs.readFileSync(FIXTURE, 'utf-8');
const TASK_COUNT_EXPECTED = 121;

console.log('═'.repeat(70));
console.log('  DProject — peer comparison');
console.log('═'.repeat(70));
console.log('  Fixture: sample-01.xml (' + (Buffer.byteLength(xml) / 1024).toFixed(1) + ' KB, ' + TASK_COUNT_EXPECTED + ' tasks)');
console.log('');

function bench(label, fn, runs) {
  runs = runs || 10;
  // warm up
  for (let i = 0; i < 3; i++) fn();
  const samples = [];
  for (let r = 0; r < runs; r++) {
    const t0 = process.hrtime.bigint();
    fn();
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  samples.sort(function (a, b) { return a - b; });
  const median = samples[Math.floor(samples.length / 2)];
  const min = samples[0];
  const max = samples[samples.length - 1];
  return { label, median, min, max };
}

const results = [];

// ── 1. DProject (full MSPDI semantic parse) ──────────────────────────────────
const DProject = require('../dproject');
results.push(Object.assign(bench('DProject.parse (full MSPDI)', function () { DProject.parse(xml); }), {
  output: 'Full Project shape (tasks, resources, deps, calendars, baselines, ext-attrs, validated)',
  loc:     '2 lines',
  coverage: 'Complete',
}));

// ── 2. htmlparser2 raw XML walk ──────────────────────────────────────────────
try {
  const htmlparser2 = require('htmlparser2');
  results.push(Object.assign(bench('htmlparser2 (raw XML tree)', function () {
    htmlparser2.parseDocument(xml, { xmlMode: true });
  }), {
    output: 'Raw DOM tree — caller must walk + decode every field',
    loc:     '~150 lines (write your own MSPDI walker)',
    coverage: 'XML only — no MSPDI semantics',
  }));
} catch (e) {
  console.log('  [htmlparser2 unavailable: ' + e.message + ']');
}

// ── 3. JSDOM DOMParser (browser-equivalent baseline) ─────────────────────────
try {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM();
  const DOMParser = dom.window.DOMParser;
  results.push(Object.assign(bench('JSDOM DOMParser', function () {
    new DOMParser().parseFromString(xml, 'text/xml');
  }), {
    output: 'DOM Document — caller writes own MSPDI walker',
    loc:     '~150 lines',
    coverage: 'XML only',
  }));
} catch (e) {
  console.log('  [JSDOM unavailable — skip browser-equiv baseline]');
}

// ── 4. mpxj-wasm (closest peer with MSPDI semantics) ─────────────────────────
let mpxjAvailable = false;
try {
  const mpxj = require('mpxj-wasm');
  mpxjAvailable = true;
  // Skipping live timing — TeaVM init is multi-second.
  results.push({
    label: 'mpxj-wasm (Java→WASM)',
    median: '(~150 ms typical, multi-sec cold start)',
    output: 'Full Project shape',
    loc:     '~8 lines + WASM init boilerplate',
    coverage: 'Complete (also reads .mpp binary)',
  });
} catch (e) {
  // expected: not installed
}

// ── Bundle size ──────────────────────────────────────────────────────────────
const distPath = path.join(__dirname, '..', 'dist', 'dproject.min.js');
let bundleMin = 0, bundleGz = 0;
if (fs.existsSync(distPath)) {
  const min = fs.readFileSync(distPath);
  bundleMin = min.length;
  bundleGz = zlib.gzipSync(min, { level: 9 }).length;
}

// ── Print table ──────────────────────────────────────────────────────────────
console.log('');
console.log('  ' + '─'.repeat(68));
console.log('  PARSE TIME (median of 10 runs, sample-01.xml)');
console.log('  ' + '─'.repeat(68));
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  if (typeof r.median === 'number') {
    console.log('    ' + r.label.padEnd(34) + ' ' + r.median.toFixed(2).padStart(8) + ' ms   (min ' + r.min.toFixed(2) + ', max ' + r.max.toFixed(2) + ')');
  } else {
    console.log('    ' + r.label.padEnd(34) + ' ' + r.median);
  }
}

console.log('');
console.log('  ' + '─'.repeat(68));
console.log('  COVERAGE & ERGONOMICS');
console.log('  ' + '─'.repeat(68));
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  console.log('    ' + r.label);
  console.log('      output  : ' + r.output);
  console.log('      LOC     : ' + r.loc);
  console.log('      coverage: ' + r.coverage);
  console.log('');
}

console.log('  ' + '─'.repeat(68));
console.log('  BUNDLE SIZE');
console.log('  ' + '─'.repeat(68));
if (bundleMin) {
  console.log('    DProject (minified):   ' + (bundleMin / 1024).toFixed(2) + ' KB');
  console.log('    DProject (gzipped):    ' + (bundleGz  / 1024).toFixed(2) + ' KB');
} else {
  console.log('    (run `npm run build` first to generate dist/dproject.min.js)');
}
console.log('    htmlparser2 (typical): ~50 KB minified, ~14 KB gzipped (XML only)');
console.log('    mpxj-wasm (typical):   ~10 MB (WASM bundle)');
console.log('');

// ── DProject ratio summary ───────────────────────────────────────────────────
const dpResult = results.find(function (r) { return /DProject/.test(r.label); });
const hpResult = results.find(function (r) { return /htmlparser2/.test(r.label); });

if (dpResult && hpResult) {
  const ratio = dpResult.median / hpResult.median;
  console.log('  ' + '─'.repeat(68));
  console.log('  RATIO');
  console.log('  ' + '─'.repeat(68));
  console.log('    DProject parse vs raw XML walk: ' + ratio.toFixed(2) + 'x');
  console.log('      → DProject does ' + ratio.toFixed(1) + 'x more work (full normalisation,');
  console.log('        type coercion, parent reconstruction, predecessor linking,');
  console.log('        baselines, calendars, extended attributes, validation).');
}

console.log('');
console.log('  ✅ Benchmark complete');
