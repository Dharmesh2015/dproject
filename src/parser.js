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
