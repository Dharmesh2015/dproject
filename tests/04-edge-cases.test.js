#!/usr/bin/env node
'use strict';
/**
 * DProject — 04 edge cases (Gate 3).
 * Empty input, malformed XML, encoding edge cases, missing collections.
 */

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
function throws(fn, m) {
  let t = false; try { fn(); } catch (e) { t = true; }
  if (!t) throw new Error(m || 'expected throw');
}

console.log('═'.repeat(60));
console.log('  DProject — 04-edge-cases');
console.log('═'.repeat(60));

// ── Input rejection ──────────────────────────────────────────────────────────
it('rejects null', function () { throws(function () { DProject.parse(null); }); });
it('rejects undefined', function () { throws(function () { DProject.parse(undefined); }); });
it('rejects empty string', function () { throws(function () { DProject.parse(''); }); });
it('rejects number', function () { throws(function () { DProject.parse(42); }); });
it('rejects object', function () { throws(function () { DProject.parse({}); }); });
it('rejects buffer-like', function () { throws(function () { DProject.parse([60, 97, 47, 62]); }); });

// ── Malformed XML ────────────────────────────────────────────────────────────
it('rejects non-Project root', function () {
  throws(function () { DProject.parse('<NotProject/>'); });
});
it('rejects mismatched tags', function () {
  throws(function () { DProject.parse('<Project><Tasks></Resources></Project>'); });
});
it('rejects unterminated tag', function () {
  throws(function () { DProject.parse('<Project><Task'); });
});

// ── Minimal valid MSPDI ──────────────────────────────────────────────────────
const MIN = '<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Name>Empty</Name></Project>';
it('parses minimal MSPDI (no Tasks/Resources/Assignments)', function () {
  const p = DProject.parse(MIN);
  eq(p.tasks.length, 0);
  eq(p.resources.length, 0);
  eq(p.assignments.length, 0);
  eq(p.meta.name, 'Empty');
});

it('returns empty arrays not null when sections absent', function () {
  const p = DProject.parse(MIN);
  ok(Array.isArray(p.tasks));
  ok(Array.isArray(p.resources));
  ok(Array.isArray(p.assignments));
});

// ── Empty collections ────────────────────────────────────────────────────────
const EMPTY_COLLECTIONS = '<Project xmlns="http://schemas.microsoft.com/project">' +
  '<Name>X</Name><Tasks></Tasks><Resources></Resources><Assignments></Assignments></Project>';
it('handles empty <Tasks/>, <Resources/>, <Assignments/>', function () {
  const p = DProject.parse(EMPTY_COLLECTIONS);
  eq(p.tasks.length, 0); eq(p.resources.length, 0); eq(p.assignments.length, 0);
});

// ── Single task with minimum fields ──────────────────────────────────────────
const SINGLE = '<Project xmlns="http://schemas.microsoft.com/project">' +
  '<Tasks><Task><UID>1</UID><ID>1</ID><Name>Hello</Name>' +
  '<OutlineLevel>1</OutlineLevel><Duration>PT8H0M0S</Duration></Task></Tasks></Project>';
it('parses single task with minimum fields', function () {
  const p = DProject.parse(SINGLE);
  eq(p.tasks.length, 1);
  eq(p.tasks[0].name, 'Hello');
  eq(p.tasks[0].duration, 480);
  eq(p.tasks[0].uid, 1);
});

// ── Special chars in task name ───────────────────────────────────────────────
it('decodes entities in task name (& < > " \')', function () {
  const xml = '<Project xmlns="http://schemas.microsoft.com/project"><Tasks>' +
    '<Task><UID>1</UID><ID>1</ID><Name>A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;</Name>' +
    '<OutlineLevel>1</OutlineLevel></Task></Tasks></Project>';
  const p = DProject.parse(xml);
  eq(p.tasks[0].name, 'A & B <C> "D" \'E\'');
});

it('preserves CDATA content in task notes verbatim', function () {
  const xml = '<Project xmlns="http://schemas.microsoft.com/project"><Tasks>' +
    '<Task><UID>1</UID><ID>1</ID><Name>X</Name>' +
    '<Notes><![CDATA[Line with <tags> & ampersands]]></Notes>' +
    '<OutlineLevel>1</OutlineLevel></Task></Tasks></Project>';
  const p = DProject.parse(xml);
  eq(p.tasks[0].notes, 'Line with <tags> & ampersands');
});

// ── BOM ──────────────────────────────────────────────────────────────────────
it('handles UTF-8 BOM at start of XML', function () {
  const p = DProject.parse('﻿<Project xmlns="http://schemas.microsoft.com/project"><Name>BOMtest</Name></Project>');
  eq(p.meta.name, 'BOMtest');
});

// ── Whitespace-rich XML ──────────────────────────────────────────────────────
it('handles XML with extensive whitespace and newlines', function () {
  const xml = '\n\n<?xml version="1.0"?>\n\n  <Project xmlns="http://schemas.microsoft.com/project">\n' +
              '    <Name>WS</Name>\n  </Project>\n\n';
  const p = DProject.parse(xml);
  eq(p.meta.name, 'WS');
});

// ── Mismatched outline levels (graceful degradation) ─────────────────────────
it('handles tasks where outline jumps by >1 level', function () {
  const xml = '<Project xmlns="http://schemas.microsoft.com/project"><Tasks>' +
    '<Task><UID>1</UID><ID>1</ID><Name>A</Name><OutlineLevel>1</OutlineLevel></Task>' +
    '<Task><UID>2</UID><ID>2</ID><Name>B</Name><OutlineLevel>5</OutlineLevel></Task>' +
    '</Tasks></Project>';
  const p = DProject.parse(xml);
  // B's parent should be null — no task at level 4 exists, so B has no immediate ancestor
  eq(p.tasks[1].parentUid, null);
});

// ── Regression (Smartsheet export bug): siblings at outline=1 without root ───
// 4 summary tasks at outline=1 with NO outline=0 project-summary above them.
// Earlier algorithm nested them inside the first (only T1 at root, T2/T3/T4
// became children of T1).
it('multiple outline=1 siblings without outline=0 root all get parentUid=null', function () {
  const xml = '<Project xmlns="http://schemas.microsoft.com/project"><Tasks>' +
    '<Task><UID>1</UID><ID>1</ID><Name>S1</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>' +
    '<Task><UID>2</UID><ID>2</ID><Name>S2</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>' +
    '<Task><UID>3</UID><ID>3</ID><Name>S3</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>' +
    '<Task><UID>4</UID><ID>4</ID><Name>S4</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>' +
    '</Tasks></Project>';
  const p = DProject.parse(xml);
  for (let i = 0; i < 4; i++) eq(p.tasks[i].parentUid, null, 'task ' + (i+1) + ' parentUid');
});

it('outline=1 siblings WITH outline=0 root all become children of root', function () {
  const xml = '<Project xmlns="http://schemas.microsoft.com/project"><Tasks>' +
    '<Task><UID>0</UID><ID>0</ID><Name>Root</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>' +
    '<Task><UID>1</UID><ID>1</ID><Name>S1</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>' +
    '<Task><UID>2</UID><ID>2</ID><Name>S2</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>' +
    '<Task><UID>3</UID><ID>3</ID><Name>S3</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>' +
    '</Tasks></Project>';
  const p = DProject.parse(xml);
  eq(p.tasks[0].parentUid, null);    // root
  eq(p.tasks[1].parentUid, 0);       // S1 → root
  eq(p.tasks[2].parentUid, 0);       // S2 → root
  eq(p.tasks[3].parentUid, 0);       // S3 → root
});

it('mixed hierarchy: root + summary + children + sibling summary', function () {
  const xml = '<Project xmlns="http://schemas.microsoft.com/project"><Tasks>' +
    '<Task><UID>0</UID><ID>0</ID><Name>Root</Name><OutlineLevel>0</OutlineLevel></Task>' +
    '<Task><UID>1</UID><ID>1</ID><Name>S1</Name><OutlineLevel>1</OutlineLevel></Task>' +
    '<Task><UID>2</UID><ID>2</ID><Name>C1</Name><OutlineLevel>2</OutlineLevel></Task>' +
    '<Task><UID>3</UID><ID>3</ID><Name>C2</Name><OutlineLevel>2</OutlineLevel></Task>' +
    '<Task><UID>4</UID><ID>4</ID><Name>S2</Name><OutlineLevel>1</OutlineLevel></Task>' +
    '<Task><UID>5</UID><ID>5</ID><Name>C3</Name><OutlineLevel>2</OutlineLevel></Task>' +
    '</Tasks></Project>';
  const p = DProject.parse(xml);
  eq(p.tasks[0].parentUid, null, 'Root');
  eq(p.tasks[1].parentUid, 0,    'S1 → Root');
  eq(p.tasks[2].parentUid, 1,    'C1 → S1');
  eq(p.tasks[3].parentUid, 1,    'C2 → S1');
  eq(p.tasks[4].parentUid, 0,    'S2 → Root (NOT inside S1)');
  eq(p.tasks[5].parentUid, 4,    'C3 → S2');
});

// ── Duration edge cases ──────────────────────────────────────────────────────
it('handles missing Duration field (returns 0 minutes)', function () {
  const xml = '<Project xmlns="http://schemas.microsoft.com/project"><Tasks>' +
    '<Task><UID>1</UID><ID>1</ID><Name>NoDur</Name><OutlineLevel>1</OutlineLevel></Task>' +
    '</Tasks></Project>';
  const p = DProject.parse(xml);
  eq(p.tasks[0].duration, 0);
});

it('handles malformed Duration (returns 0)', function () {
  const xml = '<Project xmlns="http://schemas.microsoft.com/project"><Tasks>' +
    '<Task><UID>1</UID><ID>1</ID><Name>BadDur</Name><Duration>not-a-duration</Duration><OutlineLevel>1</OutlineLevel></Task>' +
    '</Tasks></Project>';
  const p = DProject.parse(xml);
  eq(p.tasks[0].duration, 0);
});

// ── Comments inside Tasks block ──────────────────────────────────────────────
it('ignores XML comments anywhere', function () {
  const xml = '<Project xmlns="http://schemas.microsoft.com/project">' +
    '<!-- header --><Name>X</Name><Tasks><!-- inside -->' +
    '<Task><UID>1</UID><ID>1</ID><Name>T</Name><OutlineLevel>1</OutlineLevel></Task>' +
    '</Tasks></Project>';
  const p = DProject.parse(xml);
  eq(p.tasks.length, 1);
});

// ── Stylesheet / DOCTYPE harmless ────────────────────────────────────────────
it('skips xml-stylesheet PI', function () {
  const xml = '<?xml version="1.0"?><?xml-stylesheet href="x.xsl"?>' +
    '<Project xmlns="http://schemas.microsoft.com/project"><Name>X</Name></Project>';
  const p = DProject.parse(xml);
  eq(p.meta.name, 'X');
});

// ── Round-trip JSON ──────────────────────────────────────────────────────────
it('JSON.stringify(project) succeeds and round-trips', function () {
  const p = DProject.parse(SINGLE);
  const json = JSON.stringify(p);
  const back = JSON.parse(json);
  eq(back.tasks.length, 1);
  eq(back.tasks[0].name, 'Hello');
});

// ── No global pollution ──────────────────────────────────────────────────────
it('does not leak globals after parse', function () {
  const before = Object.keys(global).length;
  DProject.parse(SINGLE);
  const after = Object.keys(global).length;
  eq(after, before, 'global key count');
});

console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + pass + '/' + (pass + fail));
console.log('─'.repeat(60));
if (fail > 0) process.exit(1);
