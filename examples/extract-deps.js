#!/usr/bin/env node
'use strict';
/**
 * DProject — extract-deps.js
 *
 * Print the project's dependency graph as edges:
 *   "Predecessor name"  →  "Successor name"   (FS, lag +2d)
 *
 * Useful as input for graph tools (Graphviz, mermaid, JSON pipelines).
 * Pass `--json` to emit machine-readable JSON instead.
 *
 * Run:
 *   node examples/extract-deps.js                            # human format, sample-01.xml
 *   node examples/extract-deps.js path/to/file.xml
 *   node examples/extract-deps.js --json path/to/file.xml    # JSON edges
 *
 * TS users: same code; types come from `dproject.d.ts`:
 *   import DProject, { Project, Task, Predecessor } from 'dproject';
 */

const path = require('path');
const DProject = require('../dproject');

const args = process.argv.slice(2);
const json = args.indexOf('--json') !== -1;
const file = args.find(function (a) { return a !== '--json'; })
  || path.join(__dirname, '..', 'tests', 'fixtures', 'sample-01.xml');

DProject.fromFile(file).then(function (project) {
  /** @type {import('../dproject').Project} */
  const p = project;

  const byUid = new Map();
  p.tasks.forEach(function (t) { byUid.set(t.uid, t); });

  const edges = [];
  p.tasks.forEach(function (t) {
    t.predecessors.forEach(function (pred) {
      const from = byUid.get(pred.predecessorUid);
      if (!from) return; // dangling — skipped silently here; use validate.js to surface
      edges.push({
        fromUid: from.uid,
        fromName: from.name,
        toUid: t.uid,
        toName: t.name,
        type: pred.typeName,
        lagMinutes: pred.lag,
      });
    });
  });

  if (json) {
    console.log(JSON.stringify(edges, null, 2));
    return;
  }

  if (edges.length === 0) {
    console.log('(no dependencies in ' + path.basename(file) + ')');
    return;
  }

  console.log(p.tasks.length + ' tasks, ' + edges.length + ' edges:');
  console.log('');
  edges.forEach(function (e) {
    const lag = formatLag(e.lagMinutes);
    console.log('  ' + clip(e.fromName, 40) + '  →  ' + clip(e.toName, 40) + '   (' + e.type + lag + ')');
  });
}).catch(function (err) {
  console.error('Failed to read ' + file + ':');
  console.error(err.message);
  process.exit(1);
});

function clip(s, w) { return s.length <= w ? s.padEnd(w) : s.slice(0, w - 1) + '…'; }
function formatLag(min) {
  if (!min) return '';
  const sign = min > 0 ? '+' : '-';
  const abs = Math.abs(min);
  if (abs % 480 === 0) return ' ' + sign + (abs / 480) + 'd';
  if (abs % 60 === 0)  return ' ' + sign + (abs / 60) + 'h';
  return ' ' + sign + abs + 'm';
}
