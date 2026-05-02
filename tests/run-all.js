#!/usr/bin/env node
'use strict';
/**
 * DProject — master test runner.
 *
 *   node tests/run-all.js
 *   node tests/run-all.js --stop-on-fail
 *
 * Runs every test file and rolls up Results: N/M lines into a suite summary.
 * Mirrors DPlan's tests/run-all.js style.
 */

const { execSync } = require('child_process');
const path = require('path');

const TESTS = [
  '01-spike.test.js',
  '02-xml-tokenizer.test.js',
  '03-coerce.test.js',
  '04-edge-cases.test.js',
  '05-fixtures.test.js',
  '06-validator.test.js',
  '07-perf.test.js',
  '08-memory.test.js',          // gc-aware (auto-detects --expose-gc)
  '09-parity.test.js',
  '10-types.test.js',
  '11-rich-fields.test.js',
  '12-serialize.test.js',
  '13-fromfile-fromurl.test.js',
];

const stopOnFail = process.argv.includes('--stop-on-fail');
const rootDir = path.join(__dirname, '..');

let totalPass = 0, totalFail = 0;
const results = [];

console.log('═'.repeat(60));
console.log('  DProject Test Suite');
console.log('═'.repeat(60));

for (const file of TESTS) {
  const filePath = path.join(__dirname, file);
  console.log('\n▶ ' + file);
  // Use --expose-gc for the memory test; harmless flag for others.
  const cmd = 'node --expose-gc "' + filePath + '"';
  try {
    const out = execSync(cmd, { cwd: rootDir, encoding: 'utf8', stdio: 'pipe' });
    process.stdout.write(out);
    const m = out.match(/Results: (\d+)\/(\d+)/);
    if (m) {
      const pass = parseInt(m[1], 10);
      const total = parseInt(m[2], 10);
      const fail = total - pass;
      totalPass += pass; totalFail += fail;
      results.push({ file, pass, fail, ok: fail === 0 });
    } else {
      results.push({ file, pass: 0, fail: 0, ok: true });
    }
  } catch (e) {
    process.stdout.write(e.stdout || '');
    process.stderr.write(e.stderr || '');
    const m = (e.stdout || '').match(/Results: (\d+)\/(\d+)/);
    if (m) {
      const pass = parseInt(m[1], 10);
      const total = parseInt(m[2], 10);
      const fail = total - pass;
      totalPass += pass; totalFail += fail;
      results.push({ file, pass, fail, ok: false });
    } else {
      results.push({ file, pass: 0, fail: 1, ok: false });
      totalFail++;
    }
    if (stopOnFail) {
      console.error('\n⛔ Stopping on first failure (--stop-on-fail)');
      break;
    }
  }
}

console.log('\n' + '═'.repeat(60));
console.log('  SUITE SUMMARY');
console.log('═'.repeat(60));
for (const r of results) {
  const icon = r.ok ? '✅' : '❌';
  const detail = r.fail > 0 ? ` (${r.fail} failed)` : '';
  console.log('  ' + icon + ' ' + r.file + '  — ' + r.pass + '/' + (r.pass + r.fail) + ' passed' + detail);
}
console.log('─'.repeat(60));
const total = totalPass + totalFail;
console.log('  Total: ' + totalPass + '/' + total + ' passed' + (totalFail ? ', ' + totalFail + ' FAILED' : ''));

if (totalFail > 0) {
  console.error('\n⛔ Test suite FAILED');
  process.exit(1);
} else {
  console.log('\n✅ All DProject tests passed!');
}
