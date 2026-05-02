#!/usr/bin/env node
'use strict';
/**
 * DProject — 10 TypeScript surface check (Gate 6, soft).
 *
 *   We don't ship tsc as a dep. This test instead verifies static invariants
 *   between dproject.d.ts and:
 *     - the runtime API in dproject.js (every API symbol declared)
 *     - the consumer example examples/consumer.ts (every symbol it uses
 *       is declared in the .d.ts)
 *
 *   To run a full strict TS check, install typescript and run:
 *     npx tsc --noEmit examples/consumer.ts
 */

const fs = require('fs');
const path = require('path');
const DProject = require('../dproject');

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
console.log('  DProject — 10-types (Gate 6 — surface check)');
console.log('═'.repeat(60));

const dts = fs.readFileSync(path.join(__dirname, '..', 'dproject.d.ts'), 'utf-8');
const consumer = fs.readFileSync(path.join(__dirname, '..', 'examples', 'consumer.ts'), 'utf-8');

// ── .d.ts declares the runtime API ───────────────────────────────────────────
const RUNTIME_METHODS = ['parse', 'fromFile', 'fromUrl', 'validate', 'version', 'ERROR_CODES'];
for (let i = 0; i < RUNTIME_METHODS.length; i++) {
  const m = RUNTIME_METHODS[i];
  it('.d.ts declares DProject.' + m + ' (or covers it via interface)', function () {
    // Match either explicit member or a field on DProjectStatic / namespace
    const re = new RegExp('\\b' + m + '\\b');
    ok(re.test(dts), 'symbol "' + m + '" not found in .d.ts');
    ok(typeof DProject[m] !== 'undefined', 'runtime missing ' + m);
  });
}

// ── Required interfaces ──────────────────────────────────────────────────────
const REQUIRED_INTERFACES = [
  'Project', 'Task', 'Resource', 'Assignment',
  'Predecessor', 'ProjectMeta',
  'ISODate', 'Minutes', 'DependencyTypeName', 'DependencyTypeCode',
];
for (let i = 0; i < REQUIRED_INTERFACES.length; i++) {
  const iface = REQUIRED_INTERFACES[i];
  it('.d.ts exports ' + iface, function () {
    const re = new RegExp('export\\s+(interface|type)\\s+' + iface + '\\b');
    ok(re.test(dts), iface + ' not exported');
  });
}

// ── Required Task fields (must match runtime output) ─────────────────────────
const TASK_FIELDS = [
  'uid', 'id', 'name', 'outlineLevel', 'parentUid', 'duration',
  'start', 'finish', 'critical', 'milestone', 'summary',
  'predecessors', 'cost', 'percentComplete',
];
for (let i = 0; i < TASK_FIELDS.length; i++) {
  const f = TASK_FIELDS[i];
  it('Task interface declares ' + f, function () {
    // Look inside the Task interface block for the field
    const taskBlock = /export\s+interface\s+Task\s*\{([\s\S]*?)\n\}/.exec(dts);
    ok(taskBlock, 'Task interface block found');
    const re = new RegExp('\\b' + f + '\\s*:');
    ok(re.test(taskBlock[1]), 'Task field "' + f + '" not declared');
  });
}

// ── Predecessor interface fields ─────────────────────────────────────────────
it('Predecessor interface includes typeName + lag + predecessorUid', function () {
  const block = /export\s+interface\s+Predecessor\s*\{([\s\S]*?)\n\}/.exec(dts);
  ok(block);
  const body = block[1];
  ok(/predecessorUid\s*:/.test(body));
  ok(/typeName\s*:/.test(body));
  ok(/lag\s*:/.test(body));
});

// ── Consumer file references only declared types ─────────────────────────────
const consumerImports = /import\s+DProject,\s*\{([^}]+)\}\s+from/.exec(consumer);
it('consumer.ts imports parse cleanly', function () { ok(consumerImports); });

const importedTypes = consumerImports[1]
  .split(',')
  .map(function (s) { return s.trim(); })
  .filter(function (s) { return s.length > 0; });

for (let i = 0; i < importedTypes.length; i++) {
  const t = importedTypes[i];
  it('consumer-imported "' + t + '" is exported by .d.ts', function () {
    const re = new RegExp('export\\s+(interface|type)\\s+' + t + '\\b');
    ok(re.test(dts), t + ' not in .d.ts');
  });
}

// ── No accidentally-exported privates ────────────────────────────────────────
it('.d.ts does not export internal helpers (no _-prefixed exports)', function () {
  ok(!/export\s+(interface|type|const|function)\s+_/.test(dts));
});

// ── License header in .d.ts ──────────────────────────────────────────────────
it('.d.ts contains MIT + Dharmesh Patel attribution', function () {
  ok(/MIT/.test(dts));
  ok(/Dharmesh Patel/.test(dts));
});

// ── Regression: TS forbids `export =` together with named exports ────────────
// v1.0.6 — the old .d.ts shipped both `export default DProject` AND
// `export = DProject`, which makes `tsc --strict` fail with TS2309. The string
// grep below catches the regression without requiring tsc as a dev dep.
it('.d.ts must not use `export =` (clashes with named exports / export default)', function () {
  ok(!/^\s*export\s*=/m.test(dts), '`export = ...` is illegal beside named exports — see CHANGELOG v1.0.6');
});

console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + pass + '/' + (pass + fail));
console.log('─'.repeat(60));
if (fail > 0) process.exit(1);
