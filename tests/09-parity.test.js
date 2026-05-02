#!/usr/bin/env node
'use strict';
/**
 * DProject — 09 browser/Node parity (Gate 10).
 *
 * Strategy: load each src/* file with `require` REMOVED (simulating a browser
 * <script> tag), capture window.DProject, run the same fixture through it, and
 * compare byte-identical JSON to the Node path.
 *
 * This proves the dual-target wiring (require + window globals) gives the same
 * result without DOMParser dependency.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DProject_node = require('../dproject');

let pass = 0, fail = 0;
function it(name, fn) {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '\n     ' + (e.stack || e.message)); fail++; }
}
function eq(a, b, m) {
  if (a !== b) throw new Error((m || 'eq') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }

console.log('═'.repeat(60));
console.log('  DProject — 09-parity (Gate 10)');
console.log('═'.repeat(60));

// ── Set up a fake browser context ────────────────────────────────────────────
// We strip the `require` global so the (typeof require !== 'undefined') branch
// falls through to window.* globals — which is exactly the browser load path.

const ROOT = path.join(__dirname, '..');
const FILES = [
  'src/types/coerce.js',
  'src/types/fields.js',
  'src/xml.js',
  'src/parser.js',
  'src/normalizer.js',
  'src/validator.js',
  'dproject.js',
];

const fakeWindow = {};
const sandbox = {
  window: fakeWindow,
  console: console,
  // No `require`, no `module`, no `process` — a browser-ish environment.
};
vm.createContext(sandbox);

for (let i = 0; i < FILES.length; i++) {
  const src = fs.readFileSync(path.join(ROOT, FILES[i]), 'utf-8');
  // Replace `require(...)` calls so they evaluate to undefined; the dual-target
  // initializers in each file already check `typeof require !== 'undefined'`.
  // To force the window branch, redefine `require` to undefined inside scope.
  const wrapped = '(function () { var require = undefined; var module = undefined;\n' + src + '\n})();';
  vm.runInContext(wrapped, sandbox, { filename: FILES[i] });
}

const DProject_browser = fakeWindow.DProject;
ok(DProject_browser, 'browser-mode DProject populated');

// ── Compare outputs across all 4 fixtures ────────────────────────────────────
const fixtures = ['sample-01.xml', 'sample-3point.xml', 'sample-grouping.xml', 'sample-linktypes.xml'];
for (let i = 0; i < fixtures.length; i++) {
  const f = fixtures[i];
  const xml = fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf-8');
  const nodeOut = JSON.stringify(DProject_node.parse(xml));
  const browserOut = JSON.stringify(DProject_browser.parse(xml));
  it(f + ': node and browser paths produce identical JSON', function () {
    if (nodeOut !== browserOut) {
      // find first diff
      let p = 0;
      while (p < nodeOut.length && p < browserOut.length && nodeOut[p] === browserOut[p]) p++;
      throw new Error('diff at offset ' + p + ':\n  node: ...' + nodeOut.substring(Math.max(0,p-30), p+30) + '\nbrowser: ...' + browserOut.substring(Math.max(0,p-30), p+30));
    }
    ok(true);
  });
}

it('browser DProject.version matches node', function () {
  eq(DProject_browser.version, DProject_node.version);
});

it('browser DProject.parse + validate work together', function () {
  const xml = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-01.xml'), 'utf-8');
  const proj = DProject_browser.parse(xml);
  const r = DProject_browser.validate(proj);
  ok(r.ok, 'errors: ' + (r.errors || []).slice(0,2).map(function(e){return e.message;}).join('; '));
});

it('browser DProject.ERROR_CODES exposed', function () {
  ok(DProject_browser.ERROR_CODES);
  eq(DProject_browser.ERROR_CODES.DUPLICATE_TASK_UID, 'DUPLICATE_TASK_UID');
});

// ── No global pollution back to host process ─────────────────────────────────
it('browser path did not leak into Node global', function () {
  ok(!global.DProject);
  ok(!global.DProjectXML);
});

console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + pass + '/' + (pass + fail));
console.log('─'.repeat(60));
if (fail > 0) process.exit(1);
