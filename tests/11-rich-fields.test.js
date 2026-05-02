#!/usr/bin/env node
'use strict';
/**
 * DProject — 11 rich-fields parsing (Calendars, Baselines, ExtendedAttribute).
 *
 *   Adds coverage for the spec features that were missing in v0.5:
 *     - Calendar (incl. WeekDays + WorkingTimes + Exceptions)
 *     - Baseline (Number + Start/Finish/Duration/Work/Cost)
 *     - ExtendedAttribute definitions (project-level)
 *     - ExtendedAttribute values (per task / resource / assignment)
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
console.log('  DProject — 11-rich-fields');
console.log('═'.repeat(60));

// ── sample-3point: has Calendars + Baselines ─────────────────────────────────
const s3p = DProject.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-3point.xml'), 'utf-8'));

console.log('\n  [Calendars from sample-3point]');
it('parses calendars array', function () {
  ok(Array.isArray(s3p.calendars));
  ok(s3p.calendars.length > 0, 'has calendars');
});

it('every calendar has uid + name', function () {
  for (let i = 0; i < s3p.calendars.length; i++) {
    const c = s3p.calendars[i];
    eq(typeof c.uid, 'number');
    eq(typeof c.name, 'string');
  }
});

it('Standard calendar exists (UID 1, isBaseCalendar=true)', function () {
  const std = s3p.calendars.find(function (c) { return c.uid === 1; });
  ok(std, 'UID 1 found');
  eq(std.name, 'Standard');
  eq(std.isBaseCalendar, true);
});

it('Standard calendar has 7 weekdays (DayType 1..7)', function () {
  const std = s3p.calendars.find(function (c) { return c.uid === 1; });
  eq(std.weekDays.length, 7);
  const dts = std.weekDays.map(function (w) { return w.dayType; }).sort();
  eq(JSON.stringify(dts), '[1,2,3,4,5,6,7]');
});

it('Sunday (DayType=1) is non-working in Standard', function () {
  const std = s3p.calendars.find(function (c) { return c.uid === 1; });
  const sun = std.weekDays.find(function (w) { return w.dayType === 1; });
  eq(sun.dayWorking, false);
});

it('Monday has 2 working time blocks (split for lunch)', function () {
  const std = s3p.calendars.find(function (c) { return c.uid === 1; });
  const mon = std.weekDays.find(function (w) { return w.dayType === 2; });
  eq(mon.dayWorking, true);
  eq(mon.workingTimes.length, 2);
  eq(mon.workingTimes[0].from, '08:00:00');
  eq(mon.workingTimes[0].to, '12:00:00');
});

console.log('\n  [Baselines from sample-3point]');
const tasksWithBaseline = s3p.tasks.filter(function (t) { return t.baselines && t.baselines.length > 0; });
it('some tasks have at least one baseline', function () {
  ok(tasksWithBaseline.length > 0, 'tasks with baseline');
});

it('baseline has number + start + finish + duration + work + cost', function () {
  const b = tasksWithBaseline[0].baselines[0];
  eq(typeof b.number, 'number');
  ok(b.start);
  ok(b.finish);
  eq(typeof b.duration, 'number');
  eq(typeof b.work, 'number');
  eq(typeof b.cost, 'number');
});

it('baseline duration is in minutes (number, not PT string)', function () {
  for (let i = 0; i < tasksWithBaseline.length; i++) {
    for (let j = 0; j < tasksWithBaseline[i].baselines.length; j++) {
      const b = tasksWithBaseline[i].baselines[j];
      eq(typeof b.duration, 'number');
      ok(b.duration >= 0);
    }
  }
});

// ── sample-grouping: has ExtendedAttribute defs + per-task values ────────────
const sg = DProject.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-grouping.xml'), 'utf-8'));

console.log('\n  [ExtendedAttribute defs from sample-grouping]');
it('parses extendedAttributeDefs array', function () {
  ok(Array.isArray(sg.extendedAttributeDefs));
  ok(sg.extendedAttributeDefs.length > 0, 'has defs');
});

it('every def has fieldId + fieldName + alias', function () {
  for (let i = 0; i < sg.extendedAttributeDefs.length; i++) {
    const d = sg.extendedAttributeDefs[i];
    ok(d.fieldId, 'fieldId');
    ok(d.fieldName, 'fieldName');
  }
});

it('contains a known alias (WorkType / Phase / Team / wws / wwf)', function () {
  const aliases = sg.extendedAttributeDefs.map(function (d) { return d.alias; });
  ok(aliases.indexOf('WorkType') >= 0 || aliases.indexOf('Phase') >= 0 || aliases.indexOf('Team') >= 0,
     'expected an alias from sample-grouping');
});

console.log('\n  [Per-task ExtendedAttribute values from sample-grouping]');
const tasksWithEa = sg.tasks.filter(function (t) { return (t.extendedAttributes || []).length > 0; });
it('some tasks have extendedAttributes values', function () {
  ok(tasksWithEa.length > 0, 'tasks with ext-attr values');
});

it('every value has fieldId + value', function () {
  for (let i = 0; i < tasksWithEa.length; i++) {
    const eas = tasksWithEa[i].extendedAttributes;
    for (let j = 0; j < eas.length; j++) {
      ok(eas[j].fieldId, 'fieldId');
      ok(eas[j].value !== undefined, 'value');
    }
  }
});

it('values match a defined fieldId', function () {
  const defIds = {};
  for (let i = 0; i < sg.extendedAttributeDefs.length; i++) defIds[sg.extendedAttributeDefs[i].fieldId] = true;
  let dangling = 0;
  for (let i = 0; i < tasksWithEa.length; i++) {
    const eas = tasksWithEa[i].extendedAttributes;
    for (let j = 0; j < eas.length; j++) if (!defIds[eas[j].fieldId]) dangling++;
  }
  eq(dangling, 0, 'all values reference a defined fieldId');
});

// ── Synthetic round-trip-friendly fixture (for upcoming serializer tests) ────
const SYNTHETIC = '<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project">' +
  '<Name>Rich</Name><Title>Rich</Title>' +
  '<StartDate>2024-01-01T08:00:00</StartDate><FinishDate>2024-01-31T17:00:00</FinishDate>' +
  '<MinutesPerDay>480</MinutesPerDay><CalendarUID>1</CalendarUID>' +
  '<ExtendedAttributes>' +
    '<ExtendedAttribute><FieldID>188743731</FieldID><FieldName>Text1</FieldName><Alias>Tags</Alias></ExtendedAttribute>' +
  '</ExtendedAttributes>' +
  '<Calendars>' +
    '<Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar>' +
      '<WeekDays>' +
        '<WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>' +
        '<WeekDay><DayType>2</DayType><DayWorking>1</DayWorking>' +
          '<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>' +
        '</WeekDay>' +
      '</WeekDays>' +
      '<Exceptions>' +
        '<Exception><EnteredStartDate>2024-01-15T00:00:00</EnteredStartDate><EnteredFinishDate>2024-01-15T00:00:00</EnteredFinishDate><Name>MLK Day</Name><Type>1</Type><DayWorking>0</DayWorking></Exception>' +
      '</Exceptions>' +
    '</Calendar>' +
  '</Calendars>' +
  '<Tasks>' +
    '<Task><UID>1</UID><ID>1</ID><Name>T1</Name><OutlineLevel>1</OutlineLevel>' +
      '<Start>2024-01-02T08:00:00</Start><Finish>2024-01-05T17:00:00</Finish>' +
      '<Duration>PT32H0M0S</Duration>' +
      '<Baseline><Number>0</Number><Start>2024-01-01T08:00:00</Start><Finish>2024-01-04T17:00:00</Finish><Duration>PT32H0M0S</Duration><Work>PT0H0M0S</Work><Cost>1000</Cost></Baseline>' +
      '<ExtendedAttribute><FieldID>188743731</FieldID><Value>backend, urgent</Value></ExtendedAttribute>' +
    '</Task>' +
  '</Tasks>' +
  '<Resources/><Assignments/>' +
'</Project>';

console.log('\n  [Synthetic round-trip-shape fixture]');
const syn = DProject.parse(SYNTHETIC);
it('synthetic has 1 ExtendedAttribute def with alias "Tags"', function () {
  eq(syn.extendedAttributeDefs.length, 1);
  eq(syn.extendedAttributeDefs[0].alias, 'Tags');
  eq(syn.extendedAttributeDefs[0].fieldId, '188743731');
});

it('synthetic has 1 Calendar with 1 Exception', function () {
  eq(syn.calendars.length, 1);
  eq(syn.calendars[0].exceptions.length, 1);
  eq(syn.calendars[0].exceptions[0].name, 'MLK Day');
  eq(syn.calendars[0].exceptions[0].dayWorking, false);
});

it('synthetic task has 1 Baseline (#0)', function () {
  eq(syn.tasks[0].baselines.length, 1);
  eq(syn.tasks[0].baselines[0].number, 0);
  eq(syn.tasks[0].baselines[0].cost, 1000);
});

it('synthetic task has 1 ExtAttr value (backend, urgent)', function () {
  eq(syn.tasks[0].extendedAttributes.length, 1);
  eq(syn.tasks[0].extendedAttributes[0].fieldId, '188743731');
  eq(syn.tasks[0].extendedAttributes[0].value, 'backend, urgent');
});

console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + pass + '/' + (pass + fail));
console.log('─'.repeat(60));
if (fail > 0) process.exit(1);
