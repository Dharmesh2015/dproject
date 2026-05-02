#!/usr/bin/env node
'use strict';
/**
 * DProject — 05 fixtures (Gate 2 — all 4 real-world MSPDI samples).
 *
 * Each fixture covers a different surface of MSPDI:
 *   sample-01.xml         — large schedule, OutlineLevel hierarchy, predecessors
 *   sample-3point.xml     — 3-point estimates, multiple resources, calendars
 *   sample-grouping.xml   — custom fields, grouping
 *   sample-linktypes.xml  — all 4 dependency types (FF/FS/SF/SS)
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

function load(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');
}

console.log('═'.repeat(60));
console.log('  DProject — 05-fixtures');
console.log('═'.repeat(60));

// ── sample-01 ────────────────────────────────────────────────────────────────
const s01 = DProject.parse(load('sample-01.xml'));
console.log('\n  [sample-01.xml]');
it('s01: 121 tasks', function () { eq(s01.tasks.length, 121); });
it('s01: 3 resources', function () { eq(s01.resources.length, 3); });
it('s01: assignments > 0', function () { ok(s01.assignments.length > 0); });
it('s01: meta.title set', function () { eq(s01.meta.title, 'Project Management Workploan'); });
it('s01: every task has ISO 8601 start', function () {
  let bad = 0;
  for (let i = 0; i < s01.tasks.length; i++) {
    const t = s01.tasks[i];
    if (t.start && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t.start)) bad++;
  }
  eq(bad, 0);
});
it('s01: parent reconstruction sound', function () {
  const uids = {};
  for (let i = 0; i < s01.tasks.length; i++) uids[s01.tasks[i].uid] = true;
  let dangling = 0;
  for (let i = 0; i < s01.tasks.length; i++) {
    const p = s01.tasks[i].parentUid;
    if (p != null && !uids[p]) dangling++;
  }
  eq(dangling, 0);
});

// ── sample-3point ────────────────────────────────────────────────────────────
const s3p = DProject.parse(load('sample-3point.xml'));
console.log('\n  [sample-3point.xml]');
it('s3p: 23 tasks', function () { eq(s3p.tasks.length, 23); });
it('s3p: 11 resources', function () { eq(s3p.resources.length, 11); });
it('s3p: 26 assignments', function () { eq(s3p.assignments.length, 26); });
it('s3p: resources have integer uid', function () {
  for (let i = 0; i < s3p.resources.length; i++) eq(typeof s3p.resources[i].uid, 'number');
});
it('s3p: at least one resource has a name', function () {
  let named = 0;
  for (let i = 0; i < s3p.resources.length; i++) if (s3p.resources[i].name) named++;
  ok(named > 0);
});
it('s3p: assignments link to existing taskUids', function () {
  const tu = {};
  for (let i = 0; i < s3p.tasks.length; i++) tu[s3p.tasks[i].uid] = true;
  let bad = 0;
  for (let i = 0; i < s3p.assignments.length; i++) if (!tu[s3p.assignments[i].taskUid]) bad++;
  eq(bad, 0);
});

// ── sample-grouping ──────────────────────────────────────────────────────────
const sg = DProject.parse(load('sample-grouping.xml'));
console.log('\n  [sample-grouping.xml]');
it('sg: parses without throwing', function () { ok(sg); });
it('sg: tasks > 0', function () { ok(sg.tasks.length > 0); });
it('sg: every task has uid+id as numbers', function () {
  for (let i = 0; i < sg.tasks.length; i++) {
    const t = sg.tasks[i];
    eq(typeof t.uid, 'number'); eq(typeof t.id, 'number');
  }
});

// ── sample-linktypes (all 4 dep types) ───────────────────────────────────────
const sl = DProject.parse(load('sample-linktypes.xml'));
console.log('\n  [sample-linktypes.xml]');
it('sl: 33 tasks', function () { eq(sl.tasks.length, 33); });
it('sl: contains all 4 dependency types (FF/FS/SF/SS)', function () {
  const seen = {};
  for (let i = 0; i < sl.tasks.length; i++) {
    const preds = sl.tasks[i].predecessors || [];
    for (let j = 0; j < preds.length; j++) seen[preds[j].typeName] = true;
  }
  ok(seen.FS, 'FS seen');
  ok(seen.SS, 'SS seen');
  ok(seen.FF, 'FF seen');
  ok(seen.SF, 'SF seen');
});
it('sl: predecessor lags are numbers (minutes)', function () {
  for (let i = 0; i < sl.tasks.length; i++) {
    const preds = sl.tasks[i].predecessors || [];
    for (let j = 0; j < preds.length; j++) eq(typeof preds[j].lag, 'number');
  }
});

// ── Cross-fixture invariants ─────────────────────────────────────────────────
console.log('\n  [cross-fixture invariants]');
const all = [s01, s3p, sg, sl];
const allNames = ['sample-01', 'sample-3point', 'sample-grouping', 'sample-linktypes'];
for (let k = 0; k < all.length; k++) {
  const p = all[k];
  const name = allNames[k];
  it(name + ': JSON-serializable', function () {
    const json = JSON.stringify(p);
    ok(json.length > 100);
  });
  it(name + ': no NaN values in task durations', function () {
    let bad = 0;
    for (let i = 0; i < p.tasks.length; i++) if (Number.isNaN(p.tasks[i].duration)) bad++;
    eq(bad, 0);
  });
  it(name + ': no NaN in resource costs', function () {
    let bad = 0;
    for (let i = 0; i < p.resources.length; i++) if (Number.isNaN(p.resources[i].cost)) bad++;
    eq(bad, 0);
  });
}

console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + pass + '/' + (pass + fail));
console.log('─'.repeat(60));
if (fail > 0) process.exit(1);
