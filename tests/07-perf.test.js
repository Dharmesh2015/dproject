#!/usr/bin/env node
'use strict';
/**
 * DProject — 07 perf benchmark (Gate 8).
 *
 *   Target: parse a 1000-task synthetic MSPDI in <100ms (hot path) on Node.
 *   Cold parse may include warm-up; we run 5 warm-ups + 10 measured runs.
 *
 *   Also verifies throughput is at least 5,000 tasks/sec on commodity hardware.
 */

const DProject = require('../dproject');

let pass = 0, fail = 0;
function it(name, fn) {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '\n     ' + (e.stack || e.message)); fail++; }
}
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }

console.log('═'.repeat(60));
console.log('  DProject — 07-perf (Gate 8)');
console.log('═'.repeat(60));

// ── Synthetic MSPDI generator ────────────────────────────────────────────────
function buildSyntheticMSPDI(taskCount) {
  const parts = [];
  parts.push('<?xml version="1.0"?>');
  parts.push('<Project xmlns="http://schemas.microsoft.com/project">');
  parts.push('<Name>Bench</Name><Title>Synthetic ' + taskCount + '</Title>');
  parts.push('<StartDate>2024-01-01T08:00:00</StartDate>');
  parts.push('<FinishDate>2024-12-31T17:00:00</FinishDate>');
  parts.push('<MinutesPerDay>480</MinutesPerDay>');
  parts.push('<CurrencySymbol>$</CurrencySymbol>');
  parts.push('<Tasks>');
  for (let i = 0; i < taskCount; i++) {
    const lvl = (i % 5 === 0) ? 1 : 2;
    parts.push('<Task>');
    parts.push('<UID>' + i + '</UID>');
    parts.push('<ID>' + i + '</ID>');
    parts.push('<Name>Task ' + i + '</Name>');
    parts.push('<Type>1</Type><IsNull>0</IsNull>');
    parts.push('<OutlineLevel>' + lvl + '</OutlineLevel>');
    parts.push('<Start>2024-01-' + String((i % 28) + 1).padStart(2, '0') + 'T08:00:00</Start>');
    parts.push('<Finish>2024-01-' + String((i % 28) + 1).padStart(2, '0') + 'T17:00:00</Finish>');
    parts.push('<Duration>PT8H0M0S</Duration>');
    parts.push('<Work>PT8H0M0S</Work>');
    parts.push('<Cost>' + (i * 100) + '</Cost>');
    parts.push('<PercentComplete>' + (i % 100) + '</PercentComplete>');
    parts.push('<Summary>0</Summary><Milestone>0</Milestone>');
    parts.push('<Critical>' + (i % 7 === 0 ? 1 : 0) + '</Critical>');
    if (i > 0 && i % 3 === 0) {
      parts.push('<PredecessorLink><PredecessorUID>' + (i - 1) + '</PredecessorUID>');
      parts.push('<Type>1</Type><CrossProject>0</CrossProject><LinkLag>0</LinkLag>');
      parts.push('<LagFormat>7</LagFormat></PredecessorLink>');
    }
    parts.push('</Task>');
  }
  parts.push('</Tasks>');
  parts.push('<Resources><Resource><UID>1</UID><ID>1</ID><Name>R1</Name><Type>1</Type><MaxUnits>1</MaxUnits></Resource></Resources>');
  parts.push('<Assignments></Assignments>');
  parts.push('</Project>');
  return parts.join('');
}

const xml1k = buildSyntheticMSPDI(1000);
console.log('\n  Generated 1000-task MSPDI: ' + xml1k.length + ' bytes (' + (xml1k.length / 1024).toFixed(1) + ' KB)');

// Warmup
for (let w = 0; w < 5; w++) DProject.parse(xml1k);

// ── Measured ─────────────────────────────────────────────────────────────────
const runs = 10;
const samples = [];
for (let r = 0; r < runs; r++) {
  const t0 = process.hrtime.bigint();
  const p = DProject.parse(xml1k);
  const t1 = process.hrtime.bigint();
  samples.push(Number(t1 - t0) / 1e6);
  if (p.tasks.length !== 1000) throw new Error('parse returned ' + p.tasks.length + ' tasks, expected 1000');
}
samples.sort(function (a, b) { return a - b; });
const median = samples[Math.floor(samples.length / 2)];
const min = samples[0];
const max = samples[samples.length - 1];
const sum = samples.reduce(function (a, b) { return a + b; }, 0);
const mean = sum / samples.length;

console.log('\n  Parse times (1000 tasks, ' + runs + ' runs):');
console.log('    min    : ' + min.toFixed(2) + ' ms');
console.log('    median : ' + median.toFixed(2) + ' ms');
console.log('    mean   : ' + mean.toFixed(2) + ' ms');
console.log('    max    : ' + max.toFixed(2) + ' ms');
console.log('    rate   : ' + (1000 / (median / 1000)).toFixed(0) + ' tasks/sec');

// ── Gates ────────────────────────────────────────────────────────────────────
console.log('\n  [gates]');
it('Gate 8: median parse < 100 ms (1000 tasks)', function () {
  ok(median < 100, 'median = ' + median.toFixed(2) + 'ms');
});
it('throughput > 5,000 tasks/sec', function () {
  const tps = 1000 / (median / 1000);
  ok(tps > 5000, 'tps = ' + tps.toFixed(0));
});
it('worst case < 200ms', function () {
  ok(max < 200, 'max = ' + max.toFixed(2) + 'ms');
});
it('output is correct on synthetic input', function () {
  const p = DProject.parse(xml1k);
  ok(p.tasks.length === 1000);
  ok(p.tasks[3].predecessors.length === 1);
});

// ── Smaller fixture also fast ────────────────────────────────────────────────
const xml100 = buildSyntheticMSPDI(100);
const t100 = process.hrtime.bigint();
DProject.parse(xml100);
const ms100 = Number(process.hrtime.bigint() - t100) / 1e6;
console.log('\n  100-task parse: ' + ms100.toFixed(2) + ' ms');
it('100-task parse < 30 ms', function () {
  ok(ms100 < 30, 'ms100 = ' + ms100.toFixed(2));
});

console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + pass + '/' + (pass + fail));
console.log('─'.repeat(60));
if (fail > 0) process.exit(1);
