/*!
 * DProject v1.0.5 — MS Project (MSPDI XML) reader for JS/TS
 * https://github.com/Dharmesh2015/dplan-source/tree/main/DPlan/dproject
 * Copyright (c) 2026 Dharmesh Patel — MIT License
 */

(function(global){
"use strict";
var window = global;
var module = undefined;
// ── src/types/coerce.js ──
(function(){
'use strict';
/**
 * DProject — type coercion primitives.
 * One concern per function. Each is pure, total, and never throws on bad input —
 * returns null/zero defaults so a single bad field never breaks the whole parse.
 */

function asString(s) {
  return s == null ? '' : String(s);
}

function asInt(s) {
  if (s == null || s === '') return 0;
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

function asFloat(s) {
  if (s == null || s === '') return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function asBool(s) {
  return s === '1' || s === 'true' || s === 'TRUE' || s === 'True';
}

/**
 * MSPDI dates: ISO 8601 local date-time without timezone, e.g. 2004-04-12T08:00:00.
 * Return as-is (string) so the Project shape is JSON-serializable across runtimes.
 * Consumers can `new Date(s)` themselves; we don't bind to a timezone here.
 */
function asDate(s) {
  if (!s) return null;
  return String(s);
}

/**
 * MSPDI durations: ISO 8601 "PnYnMnDTnHnMnS". MSPDI only emits PT-form
 * (hours/minutes/seconds), e.g. PT636H0M0S. We also tolerate PnDTnHnMnS just in case.
 * Returns total minutes (number). Returns 0 for empty / unparseable.
 */
function asDurationMinutes(s) {
  if (!s) return 0;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s);
  if (!m) return 0;
  const days = m[1] ? parseInt(m[1], 10) : 0;
  const hours = m[2] ? parseInt(m[2], 10) : 0;
  const mins = m[3] ? parseInt(m[3], 10) : 0;
  const secs = m[4] ? parseFloat(m[4]) : 0;
  return days * 24 * 60 + hours * 60 + mins + secs / 60;
}

/**
 * MSPDI dependency Type codes:
 *   0 = FF (Finish-to-Finish)
 *   1 = FS (Finish-to-Start)  — most common, MS Project default
 *   2 = SF (Start-to-Finish)  — rare
 *   3 = SS (Start-to-Start)
 */
const DEP_TYPE_NAMES = ['FF', 'FS', 'SF', 'SS'];

function asDepType(s) {
  if (s == null || s === '') return 1; // missing => FS default
  const n = asInt(s);
  return n >= 0 && n < 4 ? n : 1;
}

function depTypeName(n) {
  return DEP_TYPE_NAMES[n] || 'FS';
}

/**
 * MSPDI LinkLag is in tenths of a minute (per spec). e.g. 4800 = 480 minutes = 1 working day.
 * Return whole minutes.
 */
function asLagMinutes(s) {
  return asInt(s) / 10;
}

/**
 * MSPDI ConstraintType:
 *   0 = ASAP, 1 = ALAP, 2 = MSO, 3 = MFO, 4 = SNET, 5 = SNLT, 6 = FNET, 7 = FNLT, 8 = MOO
 */
const CONSTRAINT_NAMES = ['ASAP', 'ALAP', 'MSO', 'MFO', 'SNET', 'SNLT', 'FNET', 'FNLT', 'MOO'];

function constraintName(n) {
  return CONSTRAINT_NAMES[n] || 'ASAP';
}

var _coerceExports = {
  asString: asString,
  asInt: asInt,
  asFloat: asFloat,
  asBool: asBool,
  asDate: asDate,
  asDurationMinutes: asDurationMinutes,
  asDepType: asDepType,
  depTypeName: depTypeName,
  asLagMinutes: asLagMinutes,
  constraintName: constraintName,
  DEP_TYPE_NAMES: DEP_TYPE_NAMES,
  CONSTRAINT_NAMES: CONSTRAINT_NAMES,
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _coerceExports;
}
if (typeof window !== 'undefined') {
  window.DProjectCoerce = _coerceExports;
}

})();
// ── src/types/fields.js ──
(function(){
'use strict';
/**
 * DProject — declarative MSPDI field maps.
 *
 * Open/Closed: adding a new MSPDI field = adding a row here. The walker in
 * parser.js is generic; it never hardcodes field names.
 *
 * Each entry: [mspdiName, outputKey, type]
 *   type ∈ 'string' | 'int' | 'float' | 'bool' | 'date' | 'duration'
 *
 * Fields not listed are ignored by the normaliser. If a consumer needs a rare
 * field, they can register it via dproject.registerField() (Phase 0.5).
 */

const PROJECT_FIELDS = [
  ['Name',                 'name',              'string'],
  ['Title',                'title',             'string'],
  ['Subject',              'subject',           'string'],
  ['Author',               'author',            'string'],
  ['Manager',              'manager',           'string'],
  ['Company',              'company',           'string'],
  ['Category',             'category',          'string'],
  ['Keywords',             'keywords',          'string'],
  ['CreationDate',         'createdAt',         'date'],
  ['LastSaved',            'lastSavedAt',       'date'],
  ['StartDate',            'startDate',         'date'],
  ['FinishDate',           'finishDate',        'date'],
  ['StatusDate',           'statusDate',        'date'],
  ['CurrentDate',          'currentDate',       'date'],
  ['ScheduleFromStart',    'scheduleFromStart', 'bool'],
  ['CurrencySymbol',       'currencySymbol',    'string'],
  ['CurrencyCode',         'currencyCode',      'string'],
  ['CurrencyDigits',       'currencyDigits',    'int'],
  ['MinutesPerDay',        'minutesPerDay',     'int'],
  ['MinutesPerWeek',       'minutesPerWeek',    'int'],
  ['DaysPerMonth',         'daysPerMonth',      'int'],
  ['DefaultStartTime',     'defaultStartTime',  'string'],
  ['DefaultFinishTime',    'defaultFinishTime', 'string'],
  ['CalendarUID',          'calendarUid',       'int'],
  ['DefaultTaskType',      'defaultTaskType',   'int'],
  ['WeekStartDay',         'weekStartDay',      'int'],
  ['NewTasksEstimated',    'newTasksEstimated', 'bool'],
];

// Field tuple format:
//   [mspdiName, outputKey, type, required?]
//   `required: true` means: always emit on serialize, even when the value
//   equals the natural "default" (0 / false / ""). Critical for fields where
//   0 is meaningful (UID 0 = project summary; OutlineLevel 0 = root).

const TASK_FIELDS = [
  ['UID',                  'uid',               'int',     true],
  ['ID',                   'id',                'int',     true],
  ['Name',                 'name',              'string',  true],
  ['Type',                 'type',              'int'],
  ['IsNull',               'isNull',            'bool',     true],
  ['CreateDate',           'createdAt',         'date'],
  ['Contact',              'contact',           'string'],
  ['WBS',                  'wbs',               'string'],
  ['OutlineNumber',        'outlineNumber',     'string'],
  ['OutlineLevel',         'outlineLevel',      'int',     true],
  ['Priority',             'priority',          'int'],
  ['Start',                'start',             'date'],
  ['Finish',               'finish',            'date'],
  ['Duration',             'duration',          'duration', true],
  ['DurationFormat',       'durationFormat',    'int'],
  ['Work',                 'work',              'duration'],
  ['Stop',                 'stopDate',          'date'],
  ['Resume',               'resumeDate',        'date'],
  ['EffortDriven',         'effortDriven',      'bool',     true],
  ['Recurring',            'recurring',         'bool'],
  ['OverAllocated',        'overAllocated',     'bool'],
  ['Estimated',            'estimated',         'bool'],
  ['Milestone',            'milestone',         'bool',     true],
  ['Summary',              'summary',           'bool',     true],
  ['Critical',             'critical',          'bool',     true],
  ['IsSubproject',         'isSubproject',      'bool'],
  ['ExternalTask',         'externalTask',      'bool'],
  ['EarlyStart',           'earlyStart',        'date'],
  ['EarlyFinish',          'earlyFinish',       'date'],
  ['LateStart',            'lateStart',         'date'],
  ['LateFinish',           'lateFinish',        'date'],
  ['StartVariance',        'startVariance',     'int'],
  ['FinishVariance',       'finishVariance',    'int'],
  ['WorkVariance',         'workVariance',      'float'],
  ['FreeSlack',            'freeSlack',         'int'],
  ['TotalSlack',           'totalSlack',        'int'],
  ['FixedCost',            'fixedCost',         'float'],
  ['FixedCostAccrual',     'fixedCostAccrual',  'int'],
  ['PercentComplete',      'percentComplete',   'int',     true],
  ['PercentWorkComplete',  'percentWorkComplete','int',    true],
  ['Cost',                 'cost',              'float'],
  ['ActualCost',           'actualCost',        'float'],
  ['RemainingCost',        'remainingCost',     'float'],
  ['ActualDuration',       'actualDuration',    'duration'],
  ['RemainingDuration',    'remainingDuration', 'duration'],
  ['ActualWork',           'actualWork',        'duration'],
  ['RemainingWork',        'remainingWork',     'duration'],
  ['ConstraintType',       'constraintType',    'int',     true],
  ['ConstraintDate',       'constraintDate',    'date'],
  ['Deadline',             'deadline',          'date'],
  ['CalendarUID',          'calendarUid',       'int'],
  ['Notes',                'notes',             'string'],
  ['HideBar',              'hideBar',           'bool'],
  ['Rollup',               'rollup',            'bool'],
  ['BCWS',                 'bcws',              'float'],
  ['BCWP',                 'bcwp',              'float'],
];

const RESOURCE_FIELDS = [
  ['UID',                  'uid',               'int',     true],
  ['ID',                   'id',                'int',     true],
  ['Name',                 'name',              'string',  true],
  ['Type',                 'type',              'int',     true],
  ['IsNull',               'isNull',            'bool'],
  ['Initials',             'initials',          'string'],
  ['Phonetics',            'phonetics',         'string'],
  ['NTAccount',            'ntAccount',         'string'],
  ['MaterialLabel',        'materialLabel',     'string'],
  ['Code',                 'code',              'string'],
  ['Group',                'group',             'string'],
  ['WorkGroup',            'workGroup',         'int'],
  ['EmailAddress',         'emailAddress',      'string'],
  ['MaxUnits',             'maxUnits',          'float'],
  ['PeakUnits',            'peakUnits',         'float'],
  ['OverAllocated',        'overAllocated',     'bool'],
  ['CanLevel',             'canLevel',          'bool'],
  ['AccrueAt',             'accrueAt',          'int'],
  ['Work',                 'work',              'duration'],
  ['ActualWork',           'actualWork',        'duration'],
  ['RemainingWork',        'remainingWork',     'duration'],
  ['StandardRate',         'standardRate',      'float'],
  ['OvertimeRate',         'overtimeRate',      'float'],
  ['CostPerUse',           'costPerUse',        'float'],
  ['Cost',                 'cost',              'float'],
  ['ActualCost',           'actualCost',        'float'],
  ['RemainingCost',        'remainingCost',     'float'],
  ['CalendarUID',          'calendarUid',       'int'],
  ['IsGeneric',            'isGeneric',         'bool'],
  ['IsCostResource',       'isCostResource',    'bool'],
  ['IsInactive',           'isInactive',        'bool'],
  ['Notes',                'notes',             'string'],
];

const CALENDAR_FIELDS = [
  ['UID',                  'uid',                'int',    true],
  ['Name',                 'name',               'string', true],
  ['IsBaseCalendar',       'isBaseCalendar',     'bool',   true],
  ['IsBaselineCalendar',   'isBaselineCalendar', 'bool'],
  ['BaseCalendarUID',      'baseCalendarUid',    'int',    true],
];

const EXCEPTION_FIELDS = [
  ['Name',                 'name',               'string'],
  ['Type',                 'type',               'int'],
  ['EnteredStartDate',     'startDate',          'date'],
  ['EnteredFinishDate',    'finishDate',         'date'],
  ['DayWorking',           'dayWorking',         'bool'],
  ['Occurrences',          'occurrences',        'int'],
];

const WEEKDAY_FIELDS = [
  ['DayType',              'dayType',            'int'],
  ['DayWorking',           'dayWorking',         'bool'],
];

const EXTATTR_DEF_FIELDS = [
  ['FieldID',              'fieldId',            'string'],
  ['FieldName',            'fieldName',          'string'],
  ['Alias',                'alias',              'string'],
  ['PhoneticAlias',        'phoneticAlias',      'string'],
];

const EXTATTR_VALUE_FIELDS = [
  ['FieldID',              'fieldId',            'string'],
  ['Value',                'value',              'string'],
  ['ValueID',              'valueId',            'string'],
  ['UID',                  'rowUid',             'int'],
];

const BASELINE_FIELDS = [
  ['Number',               'number',             'int'],
  ['Start',                'start',              'date'],
  ['Finish',               'finish',             'date'],
  ['Duration',             'duration',           'duration'],
  ['Work',                 'work',               'duration'],
  ['Cost',                 'cost',               'float'],
];

const ASSIGNMENT_FIELDS = [
  ['UID',                  'uid',               'int',     true],
  ['TaskUID',              'taskUid',           'int',     true],
  ['ResourceUID',          'resourceUid',       'int',     true],
  ['PercentWorkComplete',  'percentWorkComplete','int'],
  ['Units',                'units',             'float'],
  ['Work',                 'work',              'duration'],
  ['ActualWork',           'actualWork',        'duration'],
  ['RemainingWork',        'remainingWork',     'duration'],
  ['Cost',                 'cost',              'float'],
  ['ActualCost',           'actualCost',        'float'],
  ['RemainingCost',        'remainingCost',     'float'],
  ['Start',                'start',             'date'],
  ['Finish',               'finish',            'date'],
  ['Delay',                'delay',             'int'],
  ['LevelingDelay',        'levelingDelay',     'int'],
  ['CostRateTable',        'costRateTable',     'int'],
  ['Confirmed',            'confirmed',         'bool'],
  ['Notes',                'notes',             'string'],
  ['HasFixedRateUnits',    'hasFixedRateUnits', 'bool'],
  ['FixedMaterial',        'fixedMaterial',     'bool'],
];

var _fieldsExports = {
  PROJECT_FIELDS: PROJECT_FIELDS,
  TASK_FIELDS: TASK_FIELDS,
  RESOURCE_FIELDS: RESOURCE_FIELDS,
  ASSIGNMENT_FIELDS: ASSIGNMENT_FIELDS,
  CALENDAR_FIELDS: CALENDAR_FIELDS,
  EXCEPTION_FIELDS: EXCEPTION_FIELDS,
  WEEKDAY_FIELDS: WEEKDAY_FIELDS,
  EXTATTR_DEF_FIELDS: EXTATTR_DEF_FIELDS,
  EXTATTR_VALUE_FIELDS: EXTATTR_VALUE_FIELDS,
  BASELINE_FIELDS: BASELINE_FIELDS,
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _fieldsExports;
}
if (typeof window !== 'undefined') {
  window.DProjectFields = _fieldsExports;
}

})();
// ── src/xml.js ──
(function(){
'use strict';
/**
 * DProject — minimal pure-JS XML tokenizer.
 *
 * Returns a tree of nodes: { name, attrs, children, text }.
 * - Strips XML declaration, processing instructions, comments.
 * - Strips namespace prefixes ("ns:Tag" -> "Tag"); xmlns attrs preserved on root.
 * - Decodes the 5 standard entities + numeric character references.
 * - Concatenates whitespace-trimmed text inside leaf elements.
 *
 * Designed for MSPDI (well-formed, no DTD, no CDATA, no mixed content).
 * For v1.0 we may swap to streaming; for v0.x in-memory tree is fine.
 *
 * Public:
 *   parseXML(str) -> rootNode
 */

function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, function (_m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_m, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&amp;/g, '&');
}

function stripNs(name) {
  const c = name.indexOf(':');
  return c >= 0 ? name.substring(c + 1) : name;
}

function makeNode(name, attrs) {
  return { name: name, attrs: attrs, children: [], text: '' };
}

function parseXML(str) {
  if (typeof str !== 'string') throw new TypeError('parseXML: expected string');
  const len = str.length;
  let i = 0;

  if (len > 0 && str.charCodeAt(0) === 0xFEFF) i = 1;

  function isWs(c) { return c === 32 || c === 9 || c === 10 || c === 13; }
  function skipWS() { while (i < len && isWs(str.charCodeAt(i))) i++; }

  function trySkipPI() {
    if (str.charCodeAt(i) === 60 /*<*/ && str.charCodeAt(i + 1) === 63 /*?*/) {
      const end = str.indexOf('?>', i);
      if (end < 0) throw new Error('DProject: unterminated processing instruction');
      i = end + 2;
      return true;
    }
    return false;
  }

  function trySkipComment() {
    if (str.charCodeAt(i) === 60 && str.charCodeAt(i + 1) === 33 /*!*/ &&
        str.charCodeAt(i + 2) === 45 /*-*/ && str.charCodeAt(i + 3) === 45) {
      const end = str.indexOf('-->', i + 4);
      if (end < 0) throw new Error('DProject: unterminated comment');
      i = end + 3;
      return true;
    }
    return false;
  }

  function trySkipDoctype() {
    if (str.substr(i, 9).toUpperCase() === '<!DOCTYPE') {
      let depth = 1;
      i += 9;
      while (i < len && depth > 0) {
        const ch = str.charCodeAt(i);
        if (ch === 60) depth++;
        else if (ch === 62) depth--;
        i++;
      }
      return true;
    }
    return false;
  }

  // Returns literal CDATA text if matched, else null. Caller appends to current node.
  function tryReadCDATA() {
    if (str.substr(i, 9) === '<![CDATA[') {
      const end = str.indexOf(']]>', i + 9);
      if (end < 0) throw new Error('DProject: unterminated CDATA section');
      const content = str.substring(i + 9, end);
      i = end + 3;
      return content;
    }
    return null;
  }

  function readOpenTag() {
    i++;
    const nameStart = i;
    while (i < len) {
      const ch = str.charCodeAt(i);
      if (isWs(ch) || ch === 47 /*/*/ || ch === 62 /*>*/) break;
      i++;
    }
    const name = stripNs(str.substring(nameStart, i));
    const attrs = {};
    while (i < len) {
      skipWS();
      const ch = str.charCodeAt(i);
      if (ch === 47 || ch === 62) break;
      const aStart = i;
      while (i < len) {
        const c = str.charCodeAt(i);
        if (isWs(c) || c === 61 /*=*/ || c === 47 || c === 62) break;
        i++;
      }
      const aName = str.substring(aStart, i);
      let aVal = '';
      skipWS();
      if (str.charCodeAt(i) === 61) {
        i++;
        skipWS();
        const q = str.charCodeAt(i);
        if (q !== 34 /*"*/ && q !== 39 /*'*/) throw new Error('DProject: expected quoted attribute value at ' + i);
        i++;
        const vStart = i;
        while (i < len && str.charCodeAt(i) !== q) i++;
        if (i >= len) throw new Error('DProject: unterminated attribute value');
        aVal = decodeEntities(str.substring(vStart, i));
        i++;
      }
      if (aName) attrs[aName] = aVal;
    }
    let selfClosing = false;
    if (str.charCodeAt(i) === 47) { selfClosing = true; i++; }
    if (str.charCodeAt(i) !== 62) throw new Error('DProject: expected `>` at ' + i);
    i++;
    return { name: name, attrs: attrs, selfClosing: selfClosing };
  }

  function readCloseTagName() {
    i += 2;
    const start = i;
    while (i < len && str.charCodeAt(i) !== 62) i++;
    if (str.charCodeAt(i) !== 62) throw new Error('DProject: unterminated close tag');
    const name = stripNs(str.substring(start, i).replace(/\s+$/, ''));
    i++;
    return name;
  }

  function readText() {
    const start = i;
    while (i < len && str.charCodeAt(i) !== 60) i++;
    return decodeEntities(str.substring(start, i));
  }

  while (i < len) {
    skipWS();
    if (i >= len) break;
    if (str.charCodeAt(i) === 60) {
      const next = str.charCodeAt(i + 1);
      if (next === 63) { trySkipPI(); continue; }
      if (next === 33) {
        if (trySkipComment()) continue;
        if (trySkipDoctype()) continue;
        throw new Error('DProject: unsupported <! construct at ' + i);
      }
      break;
    } else {
      i++;
    }
  }

  if (i >= len || str.charCodeAt(i) !== 60) throw new Error('DProject: no root element found');
  const rootInfo = readOpenTag();
  const root = makeNode(rootInfo.name, rootInfo.attrs);
  if (rootInfo.selfClosing) return root;
  const stack = [root];

  while (i < len && stack.length > 0) {
    const ch = str.charCodeAt(i);
    if (ch === 60) {
      const next = str.charCodeAt(i + 1);
      if (next === 47) {
        const closeName = readCloseTagName();
        const top = stack[stack.length - 1];
        if (top.name !== closeName) {
          throw new Error('DProject: mismatched close tag — expected </' + top.name + '>, got </' + closeName + '>');
        }
        stack.pop();
        continue;
      }
      if (next === 63) { trySkipPI(); continue; }
      if (next === 33) {
        const cdata = tryReadCDATA();
        if (cdata !== null) {
          const top = stack[stack.length - 1];
          top.text = top.text ? top.text + cdata : cdata;
          continue;
        }
        if (trySkipComment()) continue;
        if (trySkipDoctype()) continue;
        throw new Error('DProject: unsupported <! at ' + i);
      }
      const t = readOpenTag();
      const node = makeNode(t.name, t.attrs);
      stack[stack.length - 1].children.push(node);
      if (!t.selfClosing) stack.push(node);
    } else {
      const text = readText();
      const trimmed = text.replace(/^\s+|\s+$/g, '');
      if (trimmed.length > 0) {
        const top = stack[stack.length - 1];
        top.text = top.text ? top.text + trimmed : trimmed;
      }
    }
  }

  if (stack.length > 0) throw new Error('DProject: unclosed elements: ' + stack.map(function (n) { return n.name; }).join(','));

  return root;
}

function getChild(node, name) {
  if (!node || !node.children) return null;
  const cs = node.children;
  for (let k = 0; k < cs.length; k++) if (cs[k].name === name) return cs[k];
  return null;
}

function getChildren(node, name) {
  const out = [];
  if (!node || !node.children) return out;
  const cs = node.children;
  for (let k = 0; k < cs.length; k++) if (cs[k].name === name) out.push(cs[k]);
  return out;
}

function txt(node, name) {
  const c = getChild(node, name);
  return c ? c.text : '';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseXML: parseXML, getChild: getChild, getChildren: getChildren, txt: txt };
}
if (typeof window !== 'undefined') {
  window.DProjectXML = { parseXML: parseXML, getChild: getChild, getChildren: getChildren, txt: txt };
}

})();
// ── src/parser.js ──
(function(){
'use strict';
/**
 * DProject — MSPDI element walker.
 *
 * Single Responsibility: walk an XML tree (from xml.js) and pull out raw
 * field strings for each known element type. Does NOT coerce types and does
 * NOT compute derived data (parentUid, etc.) — that's the normaliser's job.
 *
 * Open/Closed: field selection is driven by the declarative tables in
 * types/fields.js. Adding a field never touches this file.
 */

const _xml = (typeof require !== 'undefined') ? require('./xml') : (typeof window !== 'undefined' ? window.DProjectXML : null);
const _fields = (typeof require !== 'undefined') ? require('./types/fields') : (typeof window !== 'undefined' ? window.DProjectFields : null);

const getChild = _xml.getChild;
const getChildren = _xml.getChildren;
const txt = _xml.txt;

/**
 * Apply a field map to a node, returning a plain object of { outputKey: rawString }.
 * Type coercion happens later in the normaliser — keeps this layer pure.
 */
function pluckFields(node, fieldMap) {
  const out = {};
  for (let i = 0; i < fieldMap.length; i++) {
    const row = fieldMap[i];
    const mspdiName = row[0];
    const outKey = row[1];
    const c = getChild(node, mspdiName);
    out[outKey] = c ? c.text : '';
  }
  return out;
}

/**
 * Pull <PredecessorLink> children from a Task node.
 * Returns array of raw {predecessorUid, type, lag, lagFormat, crossProject}.
 */
function pluckPredecessors(taskNode) {
  const links = getChildren(taskNode, 'PredecessorLink');
  const out = [];
  for (let i = 0; i < links.length; i++) {
    const l = links[i];
    out.push({
      predecessorUid: txt(l, 'PredecessorUID'),
      type:           txt(l, 'Type'),
      lag:            txt(l, 'LinkLag'),
      lagFormat:      txt(l, 'LagFormat'),
      crossProject:   txt(l, 'CrossProject'),
    });
  }
  return out;
}

/**
 * Pull <Baseline> children from a Task node (baselines 0..10).
 */
function pluckBaselines(taskNode) {
  const out = [];
  const bs = getChildren(taskNode, 'Baseline');
  for (let i = 0; i < bs.length; i++) {
    out.push(pluckFields(bs[i], _fields.BASELINE_FIELDS));
  }
  return out;
}

/**
 * Pull <ExtendedAttribute> values from a Task/Resource/Assignment node.
 * (Definition vs value distinguished by presence of FieldName: defs have it, values don't.)
 */
function pluckExtendedAttributeValues(node) {
  const out = [];
  const eas = getChildren(node, 'ExtendedAttribute');
  for (let i = 0; i < eas.length; i++) {
    const ea = eas[i];
    if (getChild(ea, 'FieldName')) continue; // definition, not a value
    out.push(pluckFields(ea, _fields.EXTATTR_VALUE_FIELDS));
  }
  return out;
}

/**
 * Pull WeekDay tree (with WorkingTimes) from a Calendar.
 */
function pluckWeekDays(calNode) {
  const wkRoot = getChild(calNode, 'WeekDays');
  if (!wkRoot) return [];
  const wds = getChildren(wkRoot, 'WeekDay');
  const out = [];
  for (let i = 0; i < wds.length; i++) {
    const wd = wds[i];
    const row = pluckFields(wd, _fields.WEEKDAY_FIELDS);
    const wt = getChild(wd, 'WorkingTimes');
    const times = [];
    if (wt) {
      const ws = getChildren(wt, 'WorkingTime');
      for (let j = 0; j < ws.length; j++) {
        times.push({ from: txt(ws[j], 'FromTime'), to: txt(ws[j], 'ToTime') });
      }
    }
    row.workingTimes = times;
    // Exceptions sometimes nest under <TimePeriod> instead of <EnteredStart/FinishDate>.
    out.push(row);
  }
  return out;
}

/**
 * Pull Exceptions from a Calendar (handles both EnteredStartDate and TimePeriod styles).
 */
function pluckExceptions(calNode) {
  const exRoot = getChild(calNode, 'Exceptions');
  if (!exRoot) return [];
  const exs = getChildren(exRoot, 'Exception');
  const out = [];
  for (let i = 0; i < exs.length; i++) {
    const ex = exs[i];
    const row = pluckFields(ex, _fields.EXCEPTION_FIELDS);
    // TimePeriod fallback (newer MSPDI)
    if (!row.startDate || !row.finishDate) {
      const tp = getChild(ex, 'TimePeriod');
      if (tp) {
        if (!row.startDate)  row.startDate  = txt(tp, 'FromDate');
        if (!row.finishDate) row.finishDate = txt(tp, 'ToDate');
      }
    }
    out.push(row);
  }
  return out;
}

/**
 * Pull a project's top-level shape: meta + collections of raw nodes.
 * Does not coerce; outputs strings everywhere.
 */
function extractRawProject(rootNode) {
  if (!rootNode || rootNode.name !== 'Project') {
    throw new Error('DProject: not an MSPDI file (root is <' + (rootNode && rootNode.name) + '> not <Project>)');
  }

  const meta = pluckFields(rootNode, _fields.PROJECT_FIELDS);

  // ── ExtendedAttribute definitions (project-level) ───────────────────────
  const eaDefRoot = getChild(rootNode, 'ExtendedAttributes');
  const eaDefs = [];
  if (eaDefRoot) {
    const defs = getChildren(eaDefRoot, 'ExtendedAttribute');
    for (let i = 0; i < defs.length; i++) {
      eaDefs.push(pluckFields(defs[i], _fields.EXTATTR_DEF_FIELDS));
    }
  }

  // ── Calendars ───────────────────────────────────────────────────────────
  const calContainer = getChild(rootNode, 'Calendars');
  const calNodes = calContainer ? getChildren(calContainer, 'Calendar') : [];
  const calendars = [];
  for (let i = 0; i < calNodes.length; i++) {
    const cn = calNodes[i];
    const cal = pluckFields(cn, _fields.CALENDAR_FIELDS);
    cal.weekDays = pluckWeekDays(cn);
    cal.exceptions = pluckExceptions(cn);
    calendars.push(cal);
  }

  // ── Tasks (with predecessors, baselines, ext-attr values) ───────────────
  const tasksContainer = getChild(rootNode, 'Tasks');
  const taskNodes = tasksContainer ? getChildren(tasksContainer, 'Task') : [];
  const tasks = [];
  for (let i = 0; i < taskNodes.length; i++) {
    const tn = taskNodes[i];
    const t = pluckFields(tn, _fields.TASK_FIELDS);
    t.predecessors = pluckPredecessors(tn);
    t.baselines = pluckBaselines(tn);
    t.extendedAttributes = pluckExtendedAttributeValues(tn);
    tasks.push(t);
  }

  // ── Resources (with ext-attr values) ────────────────────────────────────
  const resContainer = getChild(rootNode, 'Resources');
  const resNodes = resContainer ? getChildren(resContainer, 'Resource') : [];
  const resources = [];
  for (let i = 0; i < resNodes.length; i++) {
    const rn = resNodes[i];
    const r = pluckFields(rn, _fields.RESOURCE_FIELDS);
    r.extendedAttributes = pluckExtendedAttributeValues(rn);
    resources.push(r);
  }

  // ── Assignments (with ext-attr values) ──────────────────────────────────
  const asnContainer = getChild(rootNode, 'Assignments');
  const asnNodes = asnContainer ? getChildren(asnContainer, 'Assignment') : [];
  const assignments = [];
  for (let i = 0; i < asnNodes.length; i++) {
    const an = asnNodes[i];
    const a = pluckFields(an, _fields.ASSIGNMENT_FIELDS);
    a.extendedAttributes = pluckExtendedAttributeValues(an);
    assignments.push(a);
  }

  return {
    meta: meta,
    extendedAttributeDefs: eaDefs,
    calendars: calendars,
    tasks: tasks,
    resources: resources,
    assignments: assignments,
  };
}

var _parserExports = {
  extractRawProject: extractRawProject,
  pluckFields: pluckFields,
  pluckPredecessors: pluckPredecessors,
  pluckBaselines: pluckBaselines,
  pluckExtendedAttributeValues: pluckExtendedAttributeValues,
  pluckWeekDays: pluckWeekDays,
  pluckExceptions: pluckExceptions,
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _parserExports;
}
if (typeof window !== 'undefined') {
  window.DProjectParser = _parserExports;
}

})();
// ── src/normalizer.js ──
(function(){
'use strict';
/**
 * DProject — normaliser.
 *
 * Takes the raw (string-only) Project from parser.js and:
 *   - Coerces fields by their declared type (int/float/bool/date/duration).
 *   - Computes derived fields:
 *       * task.parentUid (from outlineLevel walk over tasks in ID order)
 *       * task.predecessors[i].typeName (FF/FS/SF/SS)
 *       * task.predecessors[i].lag in minutes (MSPDI stores tenths-of-minute)
 *
 * Pure function: same input ⇒ same output. No I/O, no globals, no Date.now().
 */

const _coerce = (typeof require !== 'undefined') ? require('./types/coerce') : (typeof window !== 'undefined' ? window.DProjectCoerce : null);
const _fields = (typeof require !== 'undefined') ? require('./types/fields') : (typeof window !== 'undefined' ? window.DProjectFields : null);

function coerceOne(raw, type) {
  switch (type) {
    case 'int':      return _coerce.asInt(raw);
    case 'float':    return _coerce.asFloat(raw);
    case 'bool':     return _coerce.asBool(raw);
    case 'date':     return _coerce.asDate(raw);
    case 'duration': return _coerce.asDurationMinutes(raw);
    case 'string':
    default:         return _coerce.asString(raw);
  }
}

function coerceWithMap(rawObj, fieldMap) {
  const out = {};
  for (let i = 0; i < fieldMap.length; i++) {
    const row = fieldMap[i];
    const key = row[1];
    const type = row[2];
    out[key] = coerceOne(rawObj[key], type);
  }
  return out;
}

function normalizePredecessors(rawPreds) {
  const out = [];
  for (let i = 0; i < rawPreds.length; i++) {
    const r = rawPreds[i];
    const typeCode = _coerce.asDepType(r.type);
    out.push({
      predecessorUid: _coerce.asInt(r.predecessorUid),
      type:           typeCode,
      typeName:       _coerce.depTypeName(typeCode),
      lag:            _coerce.asLagMinutes(r.lag),
      crossProject:   _coerce.asBool(r.crossProject),
    });
  }
  return out;
}

/**
 * Walk tasks in ID order and assign parentUid based on outline-level.
 *
 *   parentUid = the most-recent task whose outlineLevel = (this task's level - 1)
 *               or null if no such ancestor exists.
 *
 * Earlier versions used a "while (stack.length > lvl) pop()" loop, which
 * silently broke when the file had no outlineLevel=0 task: a sequence of
 * sibling summaries at level 1 would have the second one become a child of
 * the first (because stack=[T1] never popped for T2 at the same level).
 *
 * Smartsheet's MSPDI export omits the level-0 project-summary row, which is
 * how we found the bug — round-tripping nested all but the first summary
 * inside the first one.
 *
 * The level-indexed map approach below is correct regardless of whether a
 * level-0 root exists.
 */
function computeParents(tasks) {
  const sorted = tasks.slice().sort(function (a, b) { return a.id - b.id; });
  const lastAtLevel = {};       // lvl → most recent task seen at that level
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const lvl = t.outlineLevel || 0;
    const parentTask = lvl > 0 ? lastAtLevel[lvl - 1] : null;
    t.parentUid = parentTask ? parentTask.uid : null;

    // "Blank sentinel" rows (isNull=true, or outline=0 with empty name) appear
    // mid-document in MS Project templates as visual separators. They MUST
    // NOT disturb the hierarchy of real tasks — otherwise subsequent tasks
    // either become children of a blank row (old algorithm) or get orphaned
    // (a naive fix). Treat them as transparent for the lastAtLevel state.
    const isBlank = t.isNull || (lvl === 0 && (!t.name || t.name === ''));
    if (isBlank && i > 0) continue;  // first row may legitimately be lvl=0 unnamed in synthetic fixtures

    lastAtLevel[lvl] = t;
    // Invalidate any deeper levels — they can't be ancestors of subsequent tasks.
    const keys = Object.keys(lastAtLevel);
    for (let k = 0; k < keys.length; k++) {
      const kn = parseInt(keys[k], 10);
      if (kn > lvl) delete lastAtLevel[kn];
    }
  }
  return tasks;
}

function normalizeBaselines(rawBaselines) {
  const out = [];
  for (let i = 0; i < rawBaselines.length; i++) {
    out.push(coerceWithMap(rawBaselines[i], _fields.BASELINE_FIELDS));
  }
  return out;
}

function normalizeExtAttrValues(rawValues) {
  const out = [];
  for (let i = 0; i < rawValues.length; i++) {
    out.push(coerceWithMap(rawValues[i], _fields.EXTATTR_VALUE_FIELDS));
  }
  return out;
}

function normalizeCalendar(rawCal) {
  const cal = coerceWithMap(rawCal, _fields.CALENDAR_FIELDS);
  cal.weekDays = [];
  const wds = rawCal.weekDays || [];
  for (let i = 0; i < wds.length; i++) {
    const wd = coerceWithMap(wds[i], _fields.WEEKDAY_FIELDS);
    wd.workingTimes = (wds[i].workingTimes || []).slice();
    cal.weekDays.push(wd);
  }
  cal.exceptions = [];
  const exs = rawCal.exceptions || [];
  for (let i = 0; i < exs.length; i++) {
    cal.exceptions.push(coerceWithMap(exs[i], _fields.EXCEPTION_FIELDS));
  }
  return cal;
}

function normalizeProject(raw) {
  const meta = coerceWithMap(raw.meta, _fields.PROJECT_FIELDS);

  // Extended attribute definitions (project-level)
  const extendedAttributeDefs = [];
  const eaDefs = raw.extendedAttributeDefs || [];
  for (let i = 0; i < eaDefs.length; i++) {
    extendedAttributeDefs.push(coerceWithMap(eaDefs[i], _fields.EXTATTR_DEF_FIELDS));
  }

  // Calendars
  const calendars = [];
  const cs = raw.calendars || [];
  for (let i = 0; i < cs.length; i++) {
    calendars.push(normalizeCalendar(cs[i]));
  }

  // Tasks
  const tasks = [];
  for (let i = 0; i < raw.tasks.length; i++) {
    const t = coerceWithMap(raw.tasks[i], _fields.TASK_FIELDS);
    t.predecessors = normalizePredecessors(raw.tasks[i].predecessors || []);
    t.baselines = normalizeBaselines(raw.tasks[i].baselines || []);
    t.extendedAttributes = normalizeExtAttrValues(raw.tasks[i].extendedAttributes || []);
    tasks.push(t);
  }
  computeParents(tasks);

  // Resources
  const resources = [];
  for (let i = 0; i < raw.resources.length; i++) {
    const r = coerceWithMap(raw.resources[i], _fields.RESOURCE_FIELDS);
    r.extendedAttributes = normalizeExtAttrValues(raw.resources[i].extendedAttributes || []);
    resources.push(r);
  }

  // Assignments
  const assignments = [];
  for (let i = 0; i < raw.assignments.length; i++) {
    const a = coerceWithMap(raw.assignments[i], _fields.ASSIGNMENT_FIELDS);
    a.extendedAttributes = normalizeExtAttrValues(raw.assignments[i].extendedAttributes || []);
    assignments.push(a);
  }

  return {
    meta: meta,
    extendedAttributeDefs: extendedAttributeDefs,
    calendars: calendars,
    tasks: tasks,
    resources: resources,
    assignments: assignments,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeProject: normalizeProject,
    coerceWithMap: coerceWithMap,
    computeParents: computeParents,
    normalizePredecessors: normalizePredecessors,
  };
}
if (typeof window !== 'undefined') {
  window.DProjectNormalizer = {
    normalizeProject: normalizeProject,
    coerceWithMap: coerceWithMap,
    computeParents: computeParents,
    normalizePredecessors: normalizePredecessors,
  };
}

})();
// ── src/validator.js ──
(function(){
'use strict';
/**
 * DProject — semantic validator.
 *
 * Runs after normalisation. Catches structural issues that the parser cannot:
 *   - duplicate UIDs
 *   - dangling parentUid / predecessorUid
 *   - circular outline (parent points to descendant)
 *   - assignments referencing missing tasks/resources
 *   - finish < start, negative durations, etc.
 *
 * Returns: { ok, errors: [{ code, message, where }] }
 *
 * SoC: validator does not mutate the project. Consumers decide whether to
 * reject, warn, or auto-repair.
 */

const ERROR_CODES = {
  DUPLICATE_TASK_UID:      'DUPLICATE_TASK_UID',
  DUPLICATE_RESOURCE_UID:  'DUPLICATE_RESOURCE_UID',
  DANGLING_PARENT:         'DANGLING_PARENT',
  DANGLING_PREDECESSOR:    'DANGLING_PREDECESSOR',
  CIRCULAR_OUTLINE:        'CIRCULAR_OUTLINE',
  CIRCULAR_DEPENDENCY:     'CIRCULAR_DEPENDENCY',
  ASSIGNMENT_BAD_TASK:     'ASSIGNMENT_BAD_TASK',
  ASSIGNMENT_BAD_RESOURCE: 'ASSIGNMENT_BAD_RESOURCE',
  FINISH_BEFORE_START:     'FINISH_BEFORE_START',
  NEGATIVE_DURATION:       'NEGATIVE_DURATION',
  MISSING_NAME:            'MISSING_NAME',
};

function err(code, message, where) {
  return { code: code, message: message, where: where };
}

function validate(project, opts) {
  opts = opts || {};
  const allowOrphanAssignments = opts.allowOrphanAssignments !== false;
  const errors = [];

  // ── Tasks: duplicate UIDs, missing names, finish<start, parent refs ────────
  const taskByUid = {};
  for (let i = 0; i < project.tasks.length; i++) {
    const t = project.tasks[i];
    if (taskByUid[t.uid] !== undefined) {
      errors.push(err(ERROR_CODES.DUPLICATE_TASK_UID,
        'Duplicate task UID ' + t.uid, { taskUid: t.uid }));
    } else {
      taskByUid[t.uid] = t;
    }
    if (t.outlineLevel > 0 && (t.name == null || t.name === '')) {
      errors.push(err(ERROR_CODES.MISSING_NAME,
        'Task ' + t.uid + ' has empty name', { taskUid: t.uid }));
    }
    if (t.start && t.finish && t.finish < t.start) {
      errors.push(err(ERROR_CODES.FINISH_BEFORE_START,
        'Task ' + t.uid + ' finish (' + t.finish + ') < start (' + t.start + ')',
        { taskUid: t.uid }));
    }
    if (typeof t.duration === 'number' && t.duration < 0) {
      errors.push(err(ERROR_CODES.NEGATIVE_DURATION,
        'Task ' + t.uid + ' has negative duration', { taskUid: t.uid }));
    }
  }

  // ── Dangling parents ───────────────────────────────────────────────────────
  for (let i = 0; i < project.tasks.length; i++) {
    const t = project.tasks[i];
    if (t.parentUid != null && taskByUid[t.parentUid] === undefined) {
      errors.push(err(ERROR_CODES.DANGLING_PARENT,
        'Task ' + t.uid + ' references missing parent ' + t.parentUid,
        { taskUid: t.uid, parentUid: t.parentUid }));
    }
  }

  // ── Circular outline (climb up to root via parentUid; cycle ⇒ error) ───────
  for (let i = 0; i < project.tasks.length; i++) {
    const start = project.tasks[i];
    let cur = start;
    let hops = 0;
    const seen = {};
    seen[cur.uid] = true;
    while (cur.parentUid != null && hops < project.tasks.length + 1) {
      const next = taskByUid[cur.parentUid];
      if (!next) break;
      if (seen[next.uid]) {
        errors.push(err(ERROR_CODES.CIRCULAR_OUTLINE,
          'Circular outline detected at task ' + start.uid,
          { taskUid: start.uid }));
        break;
      }
      seen[next.uid] = true;
      cur = next;
      hops++;
    }
  }

  // ── Predecessors point to existing tasks ───────────────────────────────────
  for (let i = 0; i < project.tasks.length; i++) {
    const t = project.tasks[i];
    const preds = t.predecessors || [];
    for (let j = 0; j < preds.length; j++) {
      const p = preds[j];
      if (p.crossProject) continue;
      if (taskByUid[p.predecessorUid] === undefined) {
        errors.push(err(ERROR_CODES.DANGLING_PREDECESSOR,
          'Task ' + t.uid + ' has predecessor ' + p.predecessorUid + ' that does not exist',
          { taskUid: t.uid, predecessorUid: p.predecessorUid }));
      }
    }
  }

  // ── Dependency-graph cycle detection (3-color DFS) ────────────────────────
  // Edges: predecessor → successor. We DFS each node; grey-on-grey = cycle.
  // Reports each cycle once (by the lowest-uid node in the cycle).
  const adj = {};
  for (let i = 0; i < project.tasks.length; i++) {
    const t = project.tasks[i];
    const preds = t.predecessors || [];
    for (let j = 0; j < preds.length; j++) {
      const p = preds[j];
      if (p.crossProject) continue;
      if (!taskByUid[p.predecessorUid]) continue;
      // pred → t (predecessor points to its successor)
      (adj[p.predecessorUid] = adj[p.predecessorUid] || []).push(t.uid);
    }
  }
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = {};
  const reported = {};
  for (let i = 0; i < project.tasks.length; i++) color[project.tasks[i].uid] = WHITE;

  function reportCycle(stack, hitUid) {
    // Cycle starts at hitUid in the stack. Find lowest uid in cycle for stable reporting.
    const start = stack.indexOf(hitUid);
    const cycle = stack.slice(start);
    let key = cycle.slice().sort(function (a, b) { return a - b; }).join(',');
    if (reported[key]) return;
    reported[key] = true;
    errors.push(err(ERROR_CODES.CIRCULAR_DEPENDENCY,
      'Circular dependency: ' + cycle.concat([hitUid]).join(' → '),
      { taskUids: cycle }));
  }

  function dfs(uid, stack) {
    color[uid] = GREY;
    stack.push(uid);
    const next = adj[uid] || [];
    for (let k = 0; k < next.length; k++) {
      const n = next[k];
      if (color[n] === GREY) {
        reportCycle(stack, n);
      } else if (color[n] === WHITE) {
        dfs(n, stack);
      }
    }
    stack.pop();
    color[uid] = BLACK;
  }
  for (let i = 0; i < project.tasks.length; i++) {
    const u = project.tasks[i].uid;
    if (color[u] === WHITE) dfs(u, []);
  }

  // ── Resources: duplicate UIDs ──────────────────────────────────────────────
  const resourceByUid = {};
  for (let i = 0; i < project.resources.length; i++) {
    const r = project.resources[i];
    if (resourceByUid[r.uid] !== undefined) {
      errors.push(err(ERROR_CODES.DUPLICATE_RESOURCE_UID,
        'Duplicate resource UID ' + r.uid, { resourceUid: r.uid }));
    } else {
      resourceByUid[r.uid] = r;
    }
  }

  // ── Assignments: linked to existing entities ───────────────────────────────
  // -65535 is the MSPDI "unassigned resource" sentinel — always tolerated.
  for (let i = 0; i < project.assignments.length; i++) {
    const a = project.assignments[i];
    if (taskByUid[a.taskUid] === undefined) {
      errors.push(err(ERROR_CODES.ASSIGNMENT_BAD_TASK,
        'Assignment references missing task ' + a.taskUid,
        { assignmentUid: a.uid, taskUid: a.taskUid }));
    }
    if (a.resourceUid !== -65535 && resourceByUid[a.resourceUid] === undefined) {
      const sev = allowOrphanAssignments ? null : err(ERROR_CODES.ASSIGNMENT_BAD_RESOURCE,
        'Assignment references missing resource ' + a.resourceUid,
        { assignmentUid: a.uid, resourceUid: a.resourceUid });
      if (sev) errors.push(sev);
    }
  }

  return { ok: errors.length === 0, errors: errors };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validate: validate, ERROR_CODES: ERROR_CODES };
}
if (typeof window !== 'undefined') {
  window.DProjectValidator = { validate: validate, ERROR_CODES: ERROR_CODES };
}

})();
// ── src/serializer.js ──
(function(){
'use strict';
/**
 * DProject — MSPDI XML serializer.
 *
 *   Inverse of parser.js + normalizer.js. Same fields.js — adding a new
 *   field never touches this file.
 *
 *   Output: standards-compliant MSPDI XML string with the
 *   xmlns="http://schemas.microsoft.com/project" namespace, accepted by
 *   MS Project, ProjectLibre, GanttProject, MPXJ.
 *
 * Spec-correct codes:
 *   PredecessorLink Type — 0=FF, 1=FS, 2=SF, 3=SS  (NOT 1/2/3/4)
 *   Lag                 — tenths of a minute (minutes × 10)
 *   ConstraintType      — 0=ASAP … 8=MOO
 *
 * Encoder design:
 *   - Pure function: serialize(project) → string
 *   - No DOM, no I/O, no Date.now()
 *   - Round-trip safe: parse(serialize(parse(xml))) === parse(xml)
 *     (modulo MSPDI spec-allowed re-ordering of optional fields)
 *
 *   Public:
 *     serialize(project, opts?) → xml string
 *
 *   opts.pretty — pretty-print with newlines + 2-space indent (default true)
 *   opts.declaration — include <?xml version="1.0"?> (default true)
 */

const _coerce = (typeof require !== 'undefined') ? require('./types/coerce') : (typeof window !== 'undefined' ? window.DProjectCoerce : null);
const _fields = (typeof require !== 'undefined') ? require('./types/fields') : (typeof window !== 'undefined' ? window.DProjectFields : null);

// ── Encoders for each declared type ───────────────────────────────────────
function encString(s) { return s == null ? '' : escXml(String(s)); }
function encInt(n)    { if (n == null) return '0'; return String(n | 0); }
function encFloat(n)  { if (n == null) return '0'; return String(+n); }
function encBool(b)   { return b ? '1' : '0'; }
function encDate(s)   { return s ? String(s) : ''; }
// Inverse of asDurationMinutes — emits ISO 8601 duration "PTnHnMnS"
function encDuration(mins) {
  if (mins == null || mins <= 0) return 'PT0H0M0S';
  const total = +mins;
  const wholeMin = Math.floor(total);
  const h = Math.floor(wholeMin / 60);
  const m = wholeMin % 60;
  const s = Math.round((total - wholeMin) * 60);
  return 'PT' + h + 'H' + m + 'M' + s + 'S';
}

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function encField(value, type) {
  switch (type) {
    case 'int':      return encInt(value);
    case 'float':    return encFloat(value);
    case 'bool':     return encBool(value);
    case 'date':     return encDate(value);
    case 'duration': return encDuration(value);
    case 'string':
    default:         return encString(value);
  }
}

/**
 * Emit a contiguous block of <Field>value</Field> elements from a fieldMap.
 * Skips fields where the value is the natural default to keep output compact:
 *   - empty string for 'string'/'date'
 *   - 0 for 'int'/'float'/'duration'
 *   - false for 'bool'
 * Pass `forceAll = true` to emit every declared field regardless.
 */
function emitFields(obj, fieldMap, indent, forceAll) {
  const out = [];
  if (!obj) return '';
  for (let i = 0; i < fieldMap.length; i++) {
    const row = fieldMap[i];
    const mspdiName = row[0];
    const outKey = row[1];
    const type = row[2];
    const required = row[3] === true;
    const value = obj[outKey];
    // Required fields are always emitted (UID, ID, Name, OutlineLevel) — even
    // when value=0/false/"". Skipping UID 0 is what made Smartsheet reject our
    // exports, since UID 0 is a valid (and required) project-summary identifier.
    if (!forceAll && !required && _isDefault(value, type)) continue;
    out.push(indent + '<' + mspdiName + '>' + encField(value, type) + '</' + mspdiName + '>');
  }
  return out.join('\n');
}

function _isDefault(v, type) {
  if (v == null) return true;
  switch (type) {
    case 'int':
    case 'float':
    case 'duration':
      return v === 0;
    case 'bool':
      return v === false;
    case 'date':
    case 'string':
      return v === '';
  }
  return false;
}

// ── Predecessors (always full ext) ────────────────────────────────────────
function emitPredecessors(preds, indent) {
  if (!preds || !preds.length) return '';
  const out = [];
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i];
    out.push(indent + '<PredecessorLink>');
    out.push(indent + '  <PredecessorUID>' + encInt(p.predecessorUid) + '</PredecessorUID>');
    out.push(indent + '  <Type>' + encInt(p.type) + '</Type>');
    out.push(indent + '  <CrossProject>' + encBool(p.crossProject) + '</CrossProject>');
    // Lag: minutes → tenths of a minute (per MSPDI spec)
    out.push(indent + '  <LinkLag>' + encInt(Math.round((p.lag || 0) * 10)) + '</LinkLag>');
    out.push(indent + '  <LagFormat>7</LagFormat>'); // 7 = days; safe default
    out.push(indent + '</PredecessorLink>');
  }
  return out.join('\n');
}

function emitBaselines(baselines, indent) {
  if (!baselines || !baselines.length) return '';
  const out = [];
  for (let i = 0; i < baselines.length; i++) {
    const b = baselines[i];
    out.push(indent + '<Baseline>');
    const inner = emitFields(b, _fields.BASELINE_FIELDS, indent + '  ', true);
    if (inner) out.push(inner);
    out.push(indent + '</Baseline>');
  }
  return out.join('\n');
}

function emitExtAttrValues(values, indent) {
  if (!values || !values.length) return '';
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out.push(indent + '<ExtendedAttribute>');
    if (v.rowUid != null && v.rowUid !== 0) out.push(indent + '  <UID>' + encInt(v.rowUid) + '</UID>');
    out.push(indent + '  <FieldID>' + encString(v.fieldId) + '</FieldID>');
    out.push(indent + '  <Value>' + encString(v.value) + '</Value>');
    if (v.valueId) out.push(indent + '  <ValueID>' + encString(v.valueId) + '</ValueID>');
    out.push(indent + '</ExtendedAttribute>');
  }
  return out.join('\n');
}

function emitExtAttrDefs(defs, indent) {
  if (!defs || !defs.length) return '';
  const out = [];
  out.push(indent + '<ExtendedAttributes>');
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    out.push(indent + '  <ExtendedAttribute>');
    out.push(indent + '    <FieldID>' + encString(d.fieldId) + '</FieldID>');
    if (d.fieldName)     out.push(indent + '    <FieldName>'     + encString(d.fieldName)     + '</FieldName>');
    if (d.alias)         out.push(indent + '    <Alias>'         + encString(d.alias)         + '</Alias>');
    if (d.phoneticAlias) out.push(indent + '    <PhoneticAlias>' + encString(d.phoneticAlias) + '</PhoneticAlias>');
    out.push(indent + '  </ExtendedAttribute>');
  }
  out.push(indent + '</ExtendedAttributes>');
  return out.join('\n');
}

function emitWeekDays(weekDays, indent) {
  if (!weekDays || !weekDays.length) return '';
  const out = [];
  out.push(indent + '<WeekDays>');
  for (let i = 0; i < weekDays.length; i++) {
    const w = weekDays[i];
    out.push(indent + '  <WeekDay>');
    out.push(indent + '    <DayType>' + encInt(w.dayType) + '</DayType>');
    out.push(indent + '    <DayWorking>' + encBool(w.dayWorking) + '</DayWorking>');
    if (w.workingTimes && w.workingTimes.length) {
      out.push(indent + '    <WorkingTimes>');
      for (let j = 0; j < w.workingTimes.length; j++) {
        const wt = w.workingTimes[j];
        out.push(indent + '      <WorkingTime>');
        out.push(indent + '        <FromTime>' + encString(wt.from) + '</FromTime>');
        out.push(indent + '        <ToTime>'   + encString(wt.to)   + '</ToTime>');
        out.push(indent + '      </WorkingTime>');
      }
      out.push(indent + '    </WorkingTimes>');
    }
    out.push(indent + '  </WeekDay>');
  }
  out.push(indent + '</WeekDays>');
  return out.join('\n');
}

function emitExceptions(exceptions, indent) {
  if (!exceptions || !exceptions.length) return '';
  const out = [];
  out.push(indent + '<Exceptions>');
  for (let i = 0; i < exceptions.length; i++) {
    const e = exceptions[i];
    out.push(indent + '  <Exception>');
    if (e.startDate)  out.push(indent + '    <EnteredStartDate>'  + encDate(e.startDate)  + '</EnteredStartDate>');
    if (e.finishDate) out.push(indent + '    <EnteredFinishDate>' + encDate(e.finishDate) + '</EnteredFinishDate>');
    if (e.name)       out.push(indent + '    <Name>' + encString(e.name) + '</Name>');
    out.push(indent + '    <Type>' + encInt(e.type || 1) + '</Type>');
    out.push(indent + '    <DayWorking>' + encBool(e.dayWorking) + '</DayWorking>');
    if (e.occurrences) out.push(indent + '    <Occurrences>' + encInt(e.occurrences) + '</Occurrences>');
    out.push(indent + '  </Exception>');
  }
  out.push(indent + '</Exceptions>');
  return out.join('\n');
}

function emitCalendars(calendars, indent) {
  if (!calendars || !calendars.length) return '';
  const out = [];
  out.push(indent + '<Calendars>');
  for (let i = 0; i < calendars.length; i++) {
    const c = calendars[i];
    out.push(indent + '  <Calendar>');
    const calBlock = emitFields(c, _fields.CALENDAR_FIELDS, indent + '    ', true);
    if (calBlock) out.push(calBlock);
    const wd = emitWeekDays(c.weekDays, indent + '    ');
    if (wd) out.push(wd);
    const ex = emitExceptions(c.exceptions, indent + '    ');
    if (ex) out.push(ex);
    out.push(indent + '  </Calendar>');
  }
  out.push(indent + '</Calendars>');
  return out.join('\n');
}

function emitTasks(tasks, indent) {
  const out = [];
  out.push(indent + '<Tasks>');
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    out.push(indent + '  <Task>');
    const block = emitFields(t, _fields.TASK_FIELDS, indent + '    ', false);
    if (block) out.push(block);
    const preds = emitPredecessors(t.predecessors, indent + '    ');
    if (preds) out.push(preds);
    const baselines = emitBaselines(t.baselines, indent + '    ');
    if (baselines) out.push(baselines);
    const eaVals = emitExtAttrValues(t.extendedAttributes, indent + '    ');
    if (eaVals) out.push(eaVals);
    out.push(indent + '  </Task>');
  }
  out.push(indent + '</Tasks>');
  return out.join('\n');
}

function emitResources(resources, indent) {
  const out = [];
  out.push(indent + '<Resources>');
  for (let i = 0; i < resources.length; i++) {
    const r = resources[i];
    out.push(indent + '  <Resource>');
    const block = emitFields(r, _fields.RESOURCE_FIELDS, indent + '    ', false);
    if (block) out.push(block);
    const eaVals = emitExtAttrValues(r.extendedAttributes, indent + '    ');
    if (eaVals) out.push(eaVals);
    out.push(indent + '  </Resource>');
  }
  out.push(indent + '</Resources>');
  return out.join('\n');
}

function emitAssignments(assignments, indent) {
  const out = [];
  out.push(indent + '<Assignments>');
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    out.push(indent + '  <Assignment>');
    const block = emitFields(a, _fields.ASSIGNMENT_FIELDS, indent + '    ', false);
    if (block) out.push(block);
    const eaVals = emitExtAttrValues(a.extendedAttributes, indent + '    ');
    if (eaVals) out.push(eaVals);
    out.push(indent + '  </Assignment>');
  }
  out.push(indent + '</Assignments>');
  return out.join('\n');
}

function serialize(project, opts) {
  if (!project || typeof project !== 'object') {
    throw new TypeError('DProject.serialize: expected Project object');
  }
  opts = opts || {};
  const includeDecl = opts.declaration !== false;
  const pretty = opts.pretty !== false;
  const indent = pretty ? '  ' : '';

  const lines = [];
  if (includeDecl) lines.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  lines.push('<Project xmlns="http://schemas.microsoft.com/project">');

  const metaBlock = emitFields(project.meta || {}, _fields.PROJECT_FIELDS, indent, false);
  if (metaBlock) lines.push(metaBlock);

  const eaDefs = emitExtAttrDefs(project.extendedAttributeDefs, indent);
  if (eaDefs) lines.push(eaDefs);

  const cals = emitCalendars(project.calendars, indent);
  if (cals) lines.push(cals);

  if (project.tasks)       lines.push(emitTasks(project.tasks, indent));
  if (project.resources)   lines.push(emitResources(project.resources, indent));
  if (project.assignments) lines.push(emitAssignments(project.assignments, indent));

  lines.push('</Project>');
  // Compact mode: strip newlines AND collapse "indent indent indent" runs (which are
  // empty when indent === ''). Joining with '' produces a single-line XML.
  return pretty ? lines.join('\n') : lines.join('').replace(/\n/g, '');
}

var _serializerExports = {
  serialize: serialize,
  // Exposed for tests + advanced consumers
  _emitFields: emitFields,
  _encDuration: encDuration,
  _escXml: escXml,
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _serializerExports;
}
if (typeof window !== 'undefined') {
  window.DProjectSerializer = _serializerExports;
}

})();
// ── dproject.js ──
(function(){
'use strict';
/**
 * DProject — MS Project (MSPDI XML) reader for JavaScript / TypeScript.
 *
 *   v0.1 spike — read MSPDI XML, return a clean Project shape.
 *
 * Public API:
 *   DProject.parse(xmlString)            -> Project
 *   DProject.fromFile(blobOrFile)        -> Promise<Project>     (browser/Node)
 *   DProject.fromUrl(url, fetchOptions?) -> Promise<Project>
 *   DProject.version
 *
 * Project shape:
 *   {
 *     meta:        { name, title, author, startDate, finishDate, currencySymbol, ... },
 *     tasks:       [ { uid, id, name, start, finish, duration, outlineLevel, parentUid,
 *                      predecessors: [ { predecessorUid, type, typeName, lag, ... } ], ... } ],
 *     resources:   [ { uid, id, name, type, maxUnits, standardRate, ... } ],
 *     assignments: [ { taskUid, resourceUid, units, work, cost, ... } ],
 *   }
 *
 * Durations are minutes (number). Dates are ISO 8601 strings (no Date objects)
 * so the result is JSON-serializable across browser, Node, and worker contexts.
 *
 * License: MIT — see LICENSE.
 * Copyright (c) 2026 Dharmesh Patel.
 */

const _xml = (typeof require !== 'undefined') ? require('./src/xml') : (typeof window !== 'undefined' ? window.DProjectXML : null);
const _parser = (typeof require !== 'undefined') ? require('./src/parser') : (typeof window !== 'undefined' ? window.DProjectParser : null);
const _normalizer = (typeof require !== 'undefined') ? require('./src/normalizer') : (typeof window !== 'undefined' ? window.DProjectNormalizer : null);
const _validator = (typeof require !== 'undefined') ? require('./src/validator') : (typeof window !== 'undefined' ? window.DProjectValidator : null);
const _serializer = (typeof require !== 'undefined') ? require('./src/serializer') : (typeof window !== 'undefined' ? window.DProjectSerializer : null);

const VERSION = '1.0.5';

function parse(xmlString) {
  if (typeof xmlString !== 'string') {
    throw new TypeError('DProject.parse: expected string, got ' + typeof xmlString);
  }
  if (xmlString.length === 0) {
    throw new Error('DProject.parse: empty input');
  }
  const tree = _xml.parseXML(xmlString);
  const raw = _parser.extractRawProject(tree);
  return _normalizer.normalizeProject(raw);
}

function _readBlobAsText(blob) {
  if (typeof Response !== 'undefined') {
    return new Response(blob).text();
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(fr.error || new Error('FileReader failed')); };
      fr.readAsText(blob, 'utf-8');
    });
  }
  return Promise.reject(new Error('DProject.fromFile: no Response or FileReader in this runtime'));
}

function fromFile(input) {
  if (input == null) return Promise.reject(new TypeError('DProject.fromFile: missing argument'));
  if (typeof input === 'string') {
    if (typeof require !== 'undefined') {
      try {
        const fs = require('fs');
        return Promise.resolve(fs.readFileSync(input, 'utf-8')).then(parse);
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return Promise.reject(new Error('DProject.fromFile: string path requires Node fs'));
  }
  return _readBlobAsText(input).then(parse);
}

function fromUrl(url, opts) {
  if (typeof fetch !== 'function') {
    return Promise.reject(new Error('DProject.fromUrl: global fetch is not available'));
  }
  return fetch(url, opts || {}).then(function (r) {
    if (!r.ok) throw new Error('DProject.fromUrl: HTTP ' + r.status + ' ' + r.statusText);
    return r.text();
  }).then(parse);
}

function validate(project, opts) {
  return _validator.validate(project, opts);
}

function serialize(project, opts) {
  return _serializer.serialize(project, opts);
}

const DProject = {
  parse: parse,
  fromFile: fromFile,
  fromUrl: fromUrl,
  validate: validate,
  serialize: serialize,
  ERROR_CODES: _validator.ERROR_CODES,
  version: VERSION,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DProject;
}
if (typeof window !== 'undefined') {
  window.DProject = DProject;
}

})();
if (typeof globalThis !== "undefined") globalThis.DProject = window.DProject;
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : this)));