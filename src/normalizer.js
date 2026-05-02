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
