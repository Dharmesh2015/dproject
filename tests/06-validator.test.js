#!/usr/bin/env node
'use strict';
/**
 * DProject — 06 validator (Gate 4).
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
console.log('  DProject — 06-validator');
console.log('═'.repeat(60));

// ── Real fixtures should validate clean ──────────────────────────────────────
const fixtures = ['sample-01.xml', 'sample-3point.xml', 'sample-grouping.xml', 'sample-linktypes.xml'];
for (let i = 0; i < fixtures.length; i++) {
  const f = fixtures[i];
  const xml = fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf-8');
  const p = DProject.parse(xml);
  const r = DProject.validate(p);
  it(f + ' validates clean', function () {
    if (!r.ok) {
      throw new Error('errors: ' + JSON.stringify(r.errors.slice(0, 3), null, 2));
    }
    ok(r.ok);
  });
}

// ── Hand-crafted: duplicate task UID ─────────────────────────────────────────
function projectWithTasks(taskList) {
  return {
    meta: {},
    tasks: taskList,
    resources: [],
    assignments: [],
  };
}
function makeTask(over) {
  return Object.assign({
    uid: 1, id: 1, name: 'T', outlineLevel: 1, parentUid: null,
    start: null, finish: null, duration: 0,
    predecessors: [],
  }, over);
}

it('detects duplicate task UID', function () {
  const p = projectWithTasks([makeTask({uid:1,id:1}), makeTask({uid:1,id:2})]);
  const r = DProject.validate(p);
  eq(r.ok, false);
  ok(r.errors.some(function(e){ return e.code === DProject.ERROR_CODES.DUPLICATE_TASK_UID; }));
});

it('detects dangling parentUid', function () {
  const p = projectWithTasks([makeTask({uid:1, parentUid:99, outlineLevel:2})]);
  const r = DProject.validate(p);
  eq(r.ok, false);
  ok(r.errors.some(function(e){ return e.code === DProject.ERROR_CODES.DANGLING_PARENT; }));
});

it('detects dangling predecessor', function () {
  const p = projectWithTasks([
    makeTask({uid:1, id:1, predecessors:[{predecessorUid:999, type:1, typeName:'FS', lag:0, crossProject:false}]}),
  ]);
  const r = DProject.validate(p);
  eq(r.ok, false);
  ok(r.errors.some(function(e){ return e.code === DProject.ERROR_CODES.DANGLING_PREDECESSOR; }));
});

it('tolerates cross-project predecessor', function () {
  const p = projectWithTasks([
    makeTask({uid:1, id:1, predecessors:[{predecessorUid:999, type:1, typeName:'FS', lag:0, crossProject:true}]}),
  ]);
  const r = DProject.validate(p);
  eq(r.ok, true);
});

it('detects circular outline', function () {
  // task 1's parent is 2, task 2's parent is 1 — cycle
  const p = projectWithTasks([
    makeTask({uid:1, id:1, parentUid:2, outlineLevel:2}),
    makeTask({uid:2, id:2, parentUid:1, outlineLevel:2}),
  ]);
  const r = DProject.validate(p);
  eq(r.ok, false);
  ok(r.errors.some(function(e){ return e.code === DProject.ERROR_CODES.CIRCULAR_OUTLINE; }));
});

it('detects finish < start', function () {
  const p = projectWithTasks([makeTask({uid:1, id:1, start:'2024-01-10T00:00:00', finish:'2024-01-05T00:00:00'})]);
  const r = DProject.validate(p);
  eq(r.ok, false);
  ok(r.errors.some(function(e){ return e.code === DProject.ERROR_CODES.FINISH_BEFORE_START; }));
});

it('detects negative duration', function () {
  const p = projectWithTasks([makeTask({uid:1, id:1, duration:-5})]);
  const r = DProject.validate(p);
  eq(r.ok, false);
  ok(r.errors.some(function(e){ return e.code === DProject.ERROR_CODES.NEGATIVE_DURATION; }));
});

it('detects empty name on non-root task', function () {
  const p = projectWithTasks([makeTask({uid:1, id:1, name:'', outlineLevel:1})]);
  const r = DProject.validate(p);
  eq(r.ok, false);
  ok(r.errors.some(function(e){ return e.code === DProject.ERROR_CODES.MISSING_NAME; }));
});

it('detects duplicate resource UID', function () {
  const p = {
    meta:{}, tasks:[],
    resources:[{uid:1,id:1,name:'A'},{uid:1,id:2,name:'B'}],
    assignments:[],
  };
  const r = DProject.validate(p);
  eq(r.ok, false);
  ok(r.errors.some(function(e){ return e.code === DProject.ERROR_CODES.DUPLICATE_RESOURCE_UID; }));
});

it('detects assignment to missing task', function () {
  const p = {
    meta:{}, tasks:[],
    resources:[{uid:1,id:1,name:'A'}],
    assignments:[{uid:1, taskUid:999, resourceUid:1}],
  };
  const r = DProject.validate(p);
  eq(r.ok, false);
  ok(r.errors.some(function(e){ return e.code === DProject.ERROR_CODES.ASSIGNMENT_BAD_TASK; }));
});

it('tolerates -65535 unassigned resource sentinel', function () {
  const p = {
    meta:{}, tasks:[makeTask({uid:1,id:1})],
    resources:[],
    assignments:[{uid:1, taskUid:1, resourceUid:-65535}],
  };
  const r = DProject.validate(p);
  eq(r.ok, true);
});

it('returns errors with code, message, where', function () {
  const p = projectWithTasks([makeTask({uid:1,id:1}), makeTask({uid:1,id:2})]);
  const r = DProject.validate(p);
  ok(r.errors.length > 0);
  const e = r.errors[0];
  ok(typeof e.code === 'string');
  ok(typeof e.message === 'string');
  ok(typeof e.where === 'object');
});

it('ERROR_CODES exposed on DProject namespace', function () {
  ok(typeof DProject.ERROR_CODES === 'object');
  eq(DProject.ERROR_CODES.DUPLICATE_TASK_UID, 'DUPLICATE_TASK_UID');
});

// ── Dependency-graph cycle detection ─────────────────────────────────────────
it('detects 2-task dep cycle (A→B→A)', function () {
  // A has no preds; B's pred is A; A's pred is B → cycle
  const p = projectWithTasks([
    makeTask({uid:1, id:1, predecessors:[{predecessorUid:2, type:1, typeName:'FS', lag:0, crossProject:false}]}),
    makeTask({uid:2, id:2, predecessors:[{predecessorUid:1, type:1, typeName:'FS', lag:0, crossProject:false}]}),
  ]);
  const r = DProject.validate(p);
  eq(r.ok, false);
  ok(r.errors.some(function(e){ return e.code === DProject.ERROR_CODES.CIRCULAR_DEPENDENCY; }));
});

it('detects 3-task dep cycle (A→B→C→A)', function () {
  const p = projectWithTasks([
    makeTask({uid:1, id:1, predecessors:[{predecessorUid:3, type:1, typeName:'FS', lag:0, crossProject:false}]}),
    makeTask({uid:2, id:2, predecessors:[{predecessorUid:1, type:1, typeName:'FS', lag:0, crossProject:false}]}),
    makeTask({uid:3, id:3, predecessors:[{predecessorUid:2, type:1, typeName:'FS', lag:0, crossProject:false}]}),
  ]);
  const r = DProject.validate(p);
  eq(r.ok, false);
  const cycles = r.errors.filter(function(e){ return e.code === DProject.ERROR_CODES.CIRCULAR_DEPENDENCY; });
  ok(cycles.length >= 1, 'at least one cycle reported');
});

it('reports each cycle only once (3 entry points, same cycle)', function () {
  const p = projectWithTasks([
    makeTask({uid:1, id:1, predecessors:[{predecessorUid:3, type:1, typeName:'FS', lag:0, crossProject:false}]}),
    makeTask({uid:2, id:2, predecessors:[{predecessorUid:1, type:1, typeName:'FS', lag:0, crossProject:false}]}),
    makeTask({uid:3, id:3, predecessors:[{predecessorUid:2, type:1, typeName:'FS', lag:0, crossProject:false}]}),
  ]);
  const r = DProject.validate(p);
  const cycles = r.errors.filter(function(e){ return e.code === DProject.ERROR_CODES.CIRCULAR_DEPENDENCY; });
  eq(cycles.length, 1, 'cycle deduplicated');
});

it('does NOT flag a valid linear chain (A→B→C)', function () {
  const p = projectWithTasks([
    makeTask({uid:1, id:1}),
    makeTask({uid:2, id:2, predecessors:[{predecessorUid:1, type:1, typeName:'FS', lag:0, crossProject:false}]}),
    makeTask({uid:3, id:3, predecessors:[{predecessorUid:2, type:1, typeName:'FS', lag:0, crossProject:false}]}),
  ]);
  const r = DProject.validate(p);
  const cycles = r.errors.filter(function(e){ return e.code === DProject.ERROR_CODES.CIRCULAR_DEPENDENCY; });
  eq(cycles.length, 0);
});

it('does NOT flag a valid diamond (A→B, A→C, B→D, C→D)', function () {
  const p = projectWithTasks([
    makeTask({uid:1, id:1}),
    makeTask({uid:2, id:2, predecessors:[{predecessorUid:1, type:1, typeName:'FS', lag:0, crossProject:false}]}),
    makeTask({uid:3, id:3, predecessors:[{predecessorUid:1, type:1, typeName:'FS', lag:0, crossProject:false}]}),
    makeTask({uid:4, id:4, predecessors:[
      {predecessorUid:2, type:1, typeName:'FS', lag:0, crossProject:false},
      {predecessorUid:3, type:1, typeName:'FS', lag:0, crossProject:false},
    ]}),
  ]);
  const r = DProject.validate(p);
  const cycles = r.errors.filter(function(e){ return e.code === DProject.ERROR_CODES.CIRCULAR_DEPENDENCY; });
  eq(cycles.length, 0);
});

it('detects self-loop (A→A) as cycle', function () {
  const p = projectWithTasks([
    makeTask({uid:1, id:1, predecessors:[{predecessorUid:1, type:1, typeName:'FS', lag:0, crossProject:false}]}),
  ]);
  const r = DProject.validate(p);
  ok(r.errors.some(function(e){ return e.code === DProject.ERROR_CODES.CIRCULAR_DEPENDENCY; }));
});

it('all 4 real fixtures are dep-cycle-clean', function () {
  const fixtures = ['sample-01.xml', 'sample-3point.xml', 'sample-grouping.xml', 'sample-linktypes.xml'];
  for (let i = 0; i < fixtures.length; i++) {
    const xml = fs.readFileSync(path.join(__dirname, 'fixtures', fixtures[i]), 'utf-8');
    const proj = DProject.parse(xml);
    const r = DProject.validate(proj);
    const cycles = r.errors.filter(function(e){ return e.code === DProject.ERROR_CODES.CIRCULAR_DEPENDENCY; });
    eq(cycles.length, 0, fixtures[i] + ' should be cycle-free');
  }
});

console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + pass + '/' + (pass + fail));
console.log('─'.repeat(60));
if (fail > 0) process.exit(1);
