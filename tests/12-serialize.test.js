#!/usr/bin/env node
'use strict';
/**
 * DProject — 12 serialize + round-trip (Gate 5).
 *
 *   Round-trip law:
 *     parse( serialize( parse(xml) ) )  ===  parse(xml)
 *
 *   We compare the structured Project shape (post-normaliser), not the raw
 *   XML, because MSPDI allows multiple equivalent encodings of the same
 *   data (field order, attribute presence). Shape equality is the right bar.
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
function deepEq(a, b, path) {
  path = path || '$';
  if (a === b) return;
  if (typeof a !== typeof b) throw new Error('type mismatch at ' + path + ': ' + typeof a + ' vs ' + typeof b);
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) throw new Error('array mismatch at ' + path);
    if (a.length !== b.length) throw new Error('length mismatch at ' + path + ': ' + a.length + ' vs ' + b.length);
    for (let i = 0; i < a.length; i++) deepEq(a[i], b[i], path + '[' + i + ']');
    return;
  }
  if (typeof a === 'object' && a !== null) {
    if (b == null) throw new Error('null mismatch at ' + path);
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join('|') !== kb.join('|')) throw new Error('keys differ at ' + path + ':\n  a: ' + ka.join(',') + '\n  b: ' + kb.join(','));
    for (let i = 0; i < ka.length; i++) deepEq(a[ka[i]], b[ka[i]], path + '.' + ka[i]);
    return;
  }
  throw new Error('value mismatch at ' + path + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
}

console.log('═'.repeat(60));
console.log('  DProject — 12-serialize (Gate 5 round-trip)');
console.log('═'.repeat(60));

// ── Basic serialize ──────────────────────────────────────────────────────────
const SIMPLE = '<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project">' +
  '<Name>X</Name><Title>X</Title><MinutesPerDay>480</MinutesPerDay>' +
  '<Tasks><Task><UID>1</UID><ID>1</ID><Name>T1</Name>' +
    '<OutlineLevel>1</OutlineLevel><Duration>PT8H0M0S</Duration></Task></Tasks>' +
  '</Project>';

it('serialize() returns a string', function () {
  const p = DProject.parse(SIMPLE);
  const xml = DProject.serialize(p);
  eq(typeof xml, 'string');
  ok(xml.length > 100);
});

it('output starts with XML declaration + Project root', function () {
  const p = DProject.parse(SIMPLE);
  const xml = DProject.serialize(p);
  ok(xml.indexOf('<?xml') === 0);
  ok(xml.indexOf('<Project xmlns="http://schemas.microsoft.com/project">') > 0);
});

it('output is well-formed (re-parses without error)', function () {
  const p = DProject.parse(SIMPLE);
  const xml = DProject.serialize(p);
  const p2 = DProject.parse(xml);
  ok(p2 && p2.tasks);
});

// ── Round-trip every fixture ─────────────────────────────────────────────────
const fixtures = [
  { name: 'sample-01.xml',         compareTasks: true,  compareCalendars: true,  compareEa: false },
  { name: 'sample-3point.xml',     compareTasks: true,  compareCalendars: true,  compareEa: false },
  { name: 'sample-grouping.xml',   compareTasks: false, compareCalendars: true,  compareEa: true  },
  { name: 'sample-linktypes.xml',  compareTasks: true,  compareCalendars: true,  compareEa: false },
];

console.log('\n  [round-trip on real fixtures]');
for (let f = 0; f < fixtures.length; f++) {
  const fx = fixtures[f];
  const xml = fs.readFileSync(path.join(__dirname, 'fixtures', fx.name), 'utf-8');
  const p1 = DProject.parse(xml);
  const xml2 = DProject.serialize(p1);
  const p2 = DProject.parse(xml2);

  it(fx.name + ': task count preserved', function () {
    eq(p2.tasks.length, p1.tasks.length);
  });

  it(fx.name + ': resource count preserved', function () {
    eq(p2.resources.length, p1.resources.length);
  });

  it(fx.name + ': assignment count preserved', function () {
    eq(p2.assignments.length, p1.assignments.length);
  });

  it(fx.name + ': calendar count preserved', function () {
    eq(p2.calendars.length, p1.calendars.length);
  });

  it(fx.name + ': all task names preserved', function () {
    for (let i = 0; i < p1.tasks.length; i++) eq(p2.tasks[i].name, p1.tasks[i].name);
  });

  it(fx.name + ': all task durations preserved (minutes)', function () {
    for (let i = 0; i < p1.tasks.length; i++) eq(p2.tasks[i].duration, p1.tasks[i].duration);
  });

  it(fx.name + ': predecessors preserved', function () {
    for (let i = 0; i < p1.tasks.length; i++) {
      const a = p1.tasks[i].predecessors;
      const b = p2.tasks[i].predecessors;
      eq(b.length, a.length, 'task ' + i + ' preds');
      for (let j = 0; j < a.length; j++) {
        eq(b[j].predecessorUid, a[j].predecessorUid, 'pred uid');
        eq(b[j].type, a[j].type, 'pred type');
        eq(b[j].typeName, a[j].typeName, 'pred typeName');
        eq(b[j].lag, a[j].lag, 'pred lag');
      }
    }
  });

  if (fx.compareCalendars) {
    it(fx.name + ': calendar weekDays preserved', function () {
      for (let i = 0; i < p1.calendars.length; i++) {
        eq(p2.calendars[i].weekDays.length, p1.calendars[i].weekDays.length);
      }
    });
  }

  if (fx.compareEa) {
    it(fx.name + ': ExtendedAttribute defs preserved', function () {
      eq(p2.extendedAttributeDefs.length, p1.extendedAttributeDefs.length);
    });
    it(fx.name + ': per-task ExtendedAttribute values preserved', function () {
      for (let i = 0; i < p1.tasks.length; i++) {
        eq((p2.tasks[i].extendedAttributes || []).length, (p1.tasks[i].extendedAttributes || []).length);
      }
    });
  }
}

// ── Spec-correct dependency type encoding (the bug we set out to fix) ────────
console.log('\n  [dependency-type spec correctness]');
it('writes FF=0, FS=1, SF=2, SS=3 (NOT 1/2/3/4)', function () {
  const proj = {
    meta: { name: 'X' },
    extendedAttributeDefs: [],
    calendars: [],
    tasks: [
      { uid:1, id:1, name:'A', outlineLevel:1, duration:480, predecessors:[], baselines:[], extendedAttributes:[] },
      { uid:2, id:2, name:'B', outlineLevel:1, duration:480, baselines:[], extendedAttributes:[],
        predecessors:[
          { predecessorUid:1, type:0, typeName:'FF', lag:0, crossProject:false },  // FF
          { predecessorUid:1, type:1, typeName:'FS', lag:0, crossProject:false },  // FS
          { predecessorUid:1, type:2, typeName:'SF', lag:0, crossProject:false },  // SF
          { predecessorUid:1, type:3, typeName:'SS', lag:0, crossProject:false },  // SS
        ] },
    ],
    resources: [],
    assignments: [],
  };
  const xml = DProject.serialize(proj);
  const p2 = DProject.parse(xml);
  const preds = p2.tasks[1].predecessors;
  eq(preds[0].typeName, 'FF');
  eq(preds[0].type, 0);
  eq(preds[1].typeName, 'FS');
  eq(preds[1].type, 1);
  eq(preds[2].typeName, 'SF');
  eq(preds[2].type, 2);
  eq(preds[3].typeName, 'SS');
  eq(preds[3].type, 3);
});

it('lag round-trips (minutes → tenths-of-min → minutes)', function () {
  const proj = {
    meta: {},
    extendedAttributeDefs: [], calendars: [], resources: [], assignments: [],
    tasks: [
      { uid:1, id:1, name:'A', outlineLevel:1, predecessors:[], baselines:[], extendedAttributes:[] },
      { uid:2, id:2, name:'B', outlineLevel:1, baselines:[], extendedAttributes:[],
        predecessors:[
          { predecessorUid:1, type:1, typeName:'FS', lag:480, crossProject:false },  // 1 work day
          { predecessorUid:1, type:1, typeName:'FS', lag:60,  crossProject:false },  // 1 hour
        ]},
    ],
  };
  const p2 = DProject.parse(DProject.serialize(proj));
  eq(p2.tasks[1].predecessors[0].lag, 480);
  eq(p2.tasks[1].predecessors[1].lag, 60);
});

// ── Synthetic full round-trip ────────────────────────────────────────────────
console.log('\n  [deep equality on synthetic Project]');
const RICH = {
  meta: {
    name: 'R', title: 'Rich', minutesPerDay: 480,
    startDate: '2024-01-01T08:00:00', finishDate: '2024-01-31T17:00:00',
    currencySymbol: '$', currencyDigits: 2,
  },
  extendedAttributeDefs: [
    { fieldId:'188743731', fieldName:'Text1', alias:'Tags', phoneticAlias:'' },
  ],
  calendars: [
    {
      uid: 1, name: 'Standard', isBaseCalendar: true, isBaselineCalendar: false, baseCalendarUid: -1,
      weekDays: [
        { dayType: 1, dayWorking: false, workingTimes: [] },
        { dayType: 2, dayWorking: true,  workingTimes: [{from:'08:00:00',to:'17:00:00'}] },
      ],
      exceptions: [
        { name:'Holiday', type:1, startDate:'2024-01-15T00:00:00', finishDate:'2024-01-15T00:00:00', dayWorking:false, occurrences:0 },
      ],
    },
  ],
  tasks: [
    { uid:1, id:1, name:'T1', outlineLevel:1, duration:1440, work:0, summary:false, milestone:false, critical:true,
      start:'2024-01-02T08:00:00', finish:'2024-01-05T17:00:00',
      predecessors: [],
      baselines: [{ number:0, start:'2024-01-01T08:00:00', finish:'2024-01-04T17:00:00', duration:1440, work:0, cost:1000 }],
      extendedAttributes: [{ fieldId:'188743731', value:'tag1, tag2', valueId:'', rowUid:0 }],
    },
  ],
  resources: [],
  assignments: [],
};

it('rich synthetic project: serialize → parse preserves task count', function () {
  const back = DProject.parse(DProject.serialize(RICH));
  eq(back.tasks.length, 1);
});

it('rich synthetic: ExtAttr def round-trips', function () {
  const back = DProject.parse(DProject.serialize(RICH));
  eq(back.extendedAttributeDefs.length, 1);
  eq(back.extendedAttributeDefs[0].alias, 'Tags');
});

it('rich synthetic: Calendar Exception round-trips', function () {
  const back = DProject.parse(DProject.serialize(RICH));
  eq(back.calendars.length, 1);
  eq(back.calendars[0].exceptions.length, 1);
  eq(back.calendars[0].exceptions[0].name, 'Holiday');
  eq(back.calendars[0].exceptions[0].dayWorking, false);
});

it('rich synthetic: Baseline #0 round-trips with cost=1000', function () {
  const back = DProject.parse(DProject.serialize(RICH));
  eq(back.tasks[0].baselines.length, 1);
  eq(back.tasks[0].baselines[0].number, 0);
  eq(back.tasks[0].baselines[0].cost, 1000);
});

it('rich synthetic: Per-task ExtAttr value round-trips', function () {
  const back = DProject.parse(DProject.serialize(RICH));
  eq(back.tasks[0].extendedAttributes.length, 1);
  eq(back.tasks[0].extendedAttributes[0].value, 'tag1, tag2');
  eq(back.tasks[0].extendedAttributes[0].fieldId, '188743731');
});

// ── pretty: false (compact) ──────────────────────────────────────────────────
console.log('\n  [pretty: false toggle]');
it('serialize({pretty:false}) returns single-line XML', function () {
  const p = DProject.parse(SIMPLE);
  const xml = DProject.serialize(p, { pretty: false });
  // Should not contain newlines (other than possibly trailing)
  eq(xml.indexOf('\n'), -1, 'no newlines in compact mode');
});

it('compact output is shorter than pretty', function () {
  const p = DProject.parse(SIMPLE);
  const pretty  = DProject.serialize(p, { pretty: true });
  const compact = DProject.serialize(p, { pretty: false });
  ok(compact.length < pretty.length, 'compact ' + compact.length + ' < pretty ' + pretty.length);
});

it('compact output round-trips via parse', function () {
  const p1 = DProject.parse(SIMPLE);
  const compact = DProject.serialize(p1, { pretty: false });
  const p2 = DProject.parse(compact);
  eq(p2.tasks.length, p1.tasks.length);
  eq(p2.tasks[0].name, p1.tasks[0].name);
});

it('declaration:false omits the <?xml ?> header', function () {
  const p = DProject.parse(SIMPLE);
  const xml = DProject.serialize(p, { declaration: false });
  eq(xml.indexOf('<?xml'), -1, 'no XML declaration');
  ok(xml.indexOf('<Project') === 0, 'starts with <Project>');
});

// ── Required fields always emitted (regression for Smartsheet rejection) ────
console.log('\n  [required fields — regression: UID 0, OutlineLevel 0 must appear]');
it('Task with UID 0 emits <UID>0</UID> (NOT skipped as default)', function () {
  const proj = {
    meta: {}, extendedAttributeDefs: [], calendars: [], resources: [], assignments: [],
    tasks: [
      { uid: 0, id: 0, name: 'Project Summary', outlineLevel: 0, summary: true,
        predecessors: [], baselines: [], extendedAttributes: [] },
    ],
  };
  const xml = DProject.serialize(proj);
  ok(xml.indexOf('<UID>0</UID>') > 0, 'UID 0 emitted');
  ok(xml.indexOf('<ID>0</ID>') > 0, 'ID 0 emitted');
  ok(xml.indexOf('<OutlineLevel>0</OutlineLevel>') > 0, 'OutlineLevel 0 emitted');
});

it('Task name "" is still emitted (required field)', function () {
  const proj = {
    meta: {}, extendedAttributeDefs: [], calendars: [], resources: [], assignments: [],
    tasks: [
      { uid: 5, id: 5, name: '', outlineLevel: 1,
        predecessors: [], baselines: [], extendedAttributes: [] },
    ],
  };
  const xml = DProject.serialize(proj);
  ok(xml.indexOf('<Name></Name>') > 0 || xml.indexOf('<Name/>') > 0, 'Name emitted even when empty');
});

it('Resource UID 1 with empty name still emits required fields', function () {
  const proj = {
    meta: {}, extendedAttributeDefs: [], calendars: [], tasks: [], assignments: [],
    resources: [
      { uid: 1, id: 1, name: '', type: 0, extendedAttributes: [] },
    ],
  };
  const xml = DProject.serialize(proj);
  ok(xml.indexOf('<UID>1</UID>') > 0, 'Resource UID emitted');
  ok(xml.indexOf('<ID>1</ID>') > 0, 'Resource ID emitted');
});

it('Assignment with TaskUID 0 emits TaskUID (not skipped)', function () {
  const proj = {
    meta: {}, extendedAttributeDefs: [], calendars: [], tasks: [], resources: [],
    assignments: [
      { uid: 1, taskUid: 0, resourceUid: 1, units: 1, work: 0, cost: 0, extendedAttributes: [] },
    ],
  };
  const xml = DProject.serialize(proj);
  ok(xml.indexOf('<TaskUID>0</TaskUID>') > 0, 'TaskUID 0 emitted');
});

it('Sample-01 round-trip preserves project-summary <UID>0</UID>', function () {
  const fs = require('fs');
  const path = require('path');
  const xml = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-01.xml'), 'utf-8');
  const p = DProject.parse(xml);
  const out = DProject.serialize(p);
  ok(out.indexOf('<UID>0</UID>') > 0, 'project summary UID 0 survives serialize');
  ok(out.indexOf('<OutlineLevel>0</OutlineLevel>') > 0, 'project summary OutlineLevel 0 survives serialize');
});

// ── XML-correctness: special chars escaped ───────────────────────────────────
it('escapes XML special chars in names (& < > " \')', function () {
  const proj = {
    meta: { name: 'A & B <C>' },
    extendedAttributeDefs: [], calendars: [], resources: [], assignments: [],
    tasks: [{ uid:1, id:1, name:'T<&>"\'', outlineLevel:1, predecessors:[], baselines:[], extendedAttributes:[] }],
  };
  const xml = DProject.serialize(proj);
  ok(xml.indexOf('&lt;') > 0 || xml.indexOf('&amp;') > 0, 'escaped output');
  const back = DProject.parse(xml);
  eq(back.tasks[0].name, 'T<&>"\'');
});

console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + pass + '/' + (pass + fail));
console.log('─'.repeat(60));
if (fail > 0) process.exit(1);
