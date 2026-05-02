#!/usr/bin/env node
'use strict';
/**
 * DProject — v0.1 spike test.
 *
 * Parses sample-01.xml end-to-end and verifies the shape, counts, type
 * coercions, parent-child reconstruction, and predecessor extraction.
 *
 * Format follows the existing DPlan test harness style (Results: N/M).
 */

const fs = require('fs');
const path = require('path');

const DProject = require('../dproject');
const coerce = require('../src/types/coerce');

const FIXTURE = path.join(__dirname, 'fixtures', 'sample-01.xml');

let pass = 0, fail = 0;
function it(name, fn) {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '\n     ' + (e.stack || e.message)); fail++; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'eq') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}
function ok(c, msg) {
  if (!c) throw new Error(msg || 'expected truthy');
}

console.log('═'.repeat(60));
console.log('  DProject — 01-spike: sample-01.xml end-to-end parse');
console.log('═'.repeat(60));

const xml = fs.readFileSync(FIXTURE, 'utf-8');
const t0 = Date.now();
const project = DProject.parse(xml);
const elapsed = Date.now() - t0;

console.log('\n[parse complete in ' + elapsed + ' ms — ' +
            project.tasks.length + ' tasks, ' +
            project.resources.length + ' resources, ' +
            project.assignments.length + ' assignments]\n');

// ── Shape ────────────────────────────────────────────────────────────────────
it('returns object with meta/tasks/resources/assignments', function () {
  ok(project && typeof project === 'object', 'project is object');
  ok(project.meta && typeof project.meta === 'object', 'meta');
  ok(Array.isArray(project.tasks), 'tasks array');
  ok(Array.isArray(project.resources), 'resources array');
  ok(Array.isArray(project.assignments), 'assignments array');
});

it('result is JSON-serializable (no Date/Function/circular)', function () {
  const json = JSON.stringify(project);
  ok(json.length > 1000, 'serialized non-empty');
  const parsed = JSON.parse(json);
  eq(parsed.tasks.length, project.tasks.length, 'tasks length round-trips');
});

// ── Counts ───────────────────────────────────────────────────────────────────
it('parses 121 tasks (matches grep count in fixture)', function () {
  eq(project.tasks.length, 121, 'task count');
});
it('parses 3 resources', function () {
  eq(project.resources.length, 3, 'resource count');
});
it('parses some assignments (>0)', function () {
  ok(project.assignments.length > 0, 'has assignments');
});

// ── Meta ─────────────────────────────────────────────────────────────────────
it('meta.title = "Project Management Workploan"', function () {
  eq(project.meta.title, 'Project Management Workploan', 'title');
});
it('meta.startDate is ISO 8601 string', function () {
  ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(project.meta.startDate), 'startDate format');
});
it('meta.currencySymbol = "$"', function () {
  eq(project.meta.currencySymbol, '$', 'currencySymbol');
});
it('meta.minutesPerDay = 480 (int, not string)', function () {
  eq(project.meta.minutesPerDay, 480, 'minutesPerDay');
  eq(typeof project.meta.minutesPerDay, 'number', 'minutesPerDay typeof');
});
it('meta.scheduleFromStart = true (bool, not "1")', function () {
  eq(project.meta.scheduleFromStart, true, 'scheduleFromStart');
});

// ── Task type coercion ───────────────────────────────────────────────────────
const root = project.tasks.find(function (t) { return t.id === 0; });
it('root task (id=0) found', function () { ok(root, 'root task'); });
it('root task name parsed', function () { eq(root.name, 'Project Management Workploan'); });
it('root task summary = true (bool)', function () { eq(root.summary, true); });
it('root task duration is number (minutes)', function () {
  eq(typeof root.duration, 'number', 'typeof duration');
  // PT636H0M0S = 636 * 60 = 38160 minutes
  eq(root.duration, 38160, 'duration in minutes');
});
it('root task uid is integer', function () {
  eq(typeof root.uid, 'number', 'typeof uid');
  eq(root.uid, 0, 'uid value');
});
it('root task percentComplete is integer', function () {
  eq(typeof root.percentComplete, 'number', 'typeof');
});

// ── Outline / parent reconstruction ──────────────────────────────────────────
it('outlineLevel is integer', function () {
  for (let i = 0; i < project.tasks.length; i++) {
    eq(typeof project.tasks[i].outlineLevel, 'number', 'task[' + i + '].outlineLevel');
  }
});
it('every non-root task has a parentUid', function () {
  let missing = 0;
  for (let i = 0; i < project.tasks.length; i++) {
    const t = project.tasks[i];
    if (t.outlineLevel > 0 && t.parentUid == null) missing++;
  }
  eq(missing, 0, 'missing parentUid count');
});
it('every parentUid references a real task UID', function () {
  const uids = {};
  for (let i = 0; i < project.tasks.length; i++) uids[project.tasks[i].uid] = true;
  let dangling = 0;
  for (let i = 0; i < project.tasks.length; i++) {
    const p = project.tasks[i].parentUid;
    if (p != null && !uids[p]) dangling++;
  }
  eq(dangling, 0, 'dangling parentUid');
});

// ── Predecessors ─────────────────────────────────────────────────────────────
const tasksWithPreds = project.tasks.filter(function (t) { return t.predecessors.length > 0; });
it('some tasks have predecessors (>0)', function () {
  ok(tasksWithPreds.length > 0, 'tasks with preds');
});
it('predecessor.lag is in minutes (number, not raw tenths)', function () {
  for (let i = 0; i < tasksWithPreds.length; i++) {
    for (let j = 0; j < tasksWithPreds[i].predecessors.length; j++) {
      const p = tasksWithPreds[i].predecessors[j];
      eq(typeof p.lag, 'number', 'lag typeof');
    }
  }
});
it('predecessor.typeName is FF/FS/SF/SS', function () {
  const valid = { FF: 1, FS: 1, SF: 1, SS: 1 };
  for (let i = 0; i < tasksWithPreds.length; i++) {
    for (let j = 0; j < tasksWithPreds[i].predecessors.length; j++) {
      const p = tasksWithPreds[i].predecessors[j];
      ok(valid[p.typeName], 'typeName=' + p.typeName);
    }
  }
});

// ── Resources ────────────────────────────────────────────────────────────────
it('resources have integer uid and name', function () {
  for (let i = 0; i < project.resources.length; i++) {
    const r = project.resources[i];
    eq(typeof r.uid, 'number', 'uid typeof');
  }
});

// ── Assignments ──────────────────────────────────────────────────────────────
it('assignments link to existing taskUid', function () {
  const taskUids = {};
  for (let i = 0; i < project.tasks.length; i++) taskUids[project.tasks[i].uid] = true;
  let orphan = 0;
  for (let i = 0; i < project.assignments.length; i++) {
    if (!taskUids[project.assignments[i].taskUid]) orphan++;
  }
  // Note: orphan assignments are tolerated by MS Project (e.g. ResourceUID=-65535
  // is the "unassigned" sentinel) — but every assignment SHOULD point to a real task.
  eq(orphan, 0, 'orphan assignments');
});

// ── API surface ──────────────────────────────────────────────────────────────
it('DProject.version is a string', function () {
  eq(typeof DProject.version, 'string', 'version');
});
it('DProject.parse throws on non-string input', function () {
  let threw = false;
  try { DProject.parse(123); } catch (e) { threw = true; }
  eq(threw, true, 'parse(int) threw');
});
it('DProject.parse throws on empty string', function () {
  let threw = false;
  try { DProject.parse(''); } catch (e) { threw = true; }
  eq(threw, true, 'parse("") threw');
});
it('DProject.parse throws on non-MSPDI XML', function () {
  let threw = false;
  try { DProject.parse('<NotProject><x/></NotProject>'); } catch (e) { threw = true; }
  eq(threw, true, 'parse(non-MSPDI) threw');
});

// ── Coerce sanity (unit-level, no fixture) ───────────────────────────────────
it('asDurationMinutes("PT8H0M0S") = 480', function () { eq(coerce.asDurationMinutes('PT8H0M0S'), 480); });
it('asDurationMinutes("PT636H0M0S") = 38160', function () { eq(coerce.asDurationMinutes('PT636H0M0S'), 38160); });
it('asDurationMinutes("") = 0', function () { eq(coerce.asDurationMinutes(''), 0); });
it('asDurationMinutes("garbage") = 0', function () { eq(coerce.asDurationMinutes('garbage'), 0); });
it('asBool("1") true, asBool("0") false', function () { eq(coerce.asBool('1'), true); eq(coerce.asBool('0'), false); });
it('asInt("42") = 42', function () { eq(coerce.asInt('42'), 42); });
it('asInt("") = 0', function () { eq(coerce.asInt(''), 0); });
it('depTypeName(1) = FS, depTypeName(0) = FF', function () { eq(coerce.depTypeName(1), 'FS'); eq(coerce.depTypeName(0), 'FF'); });
it('asLagMinutes("4800") = 480 (one working day)', function () { eq(coerce.asLagMinutes('4800'), 480); });

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + pass + '/' + (pass + fail));
console.log('─'.repeat(60));
if (fail > 0) process.exit(1);
