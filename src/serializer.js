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
