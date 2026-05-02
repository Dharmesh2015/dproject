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
