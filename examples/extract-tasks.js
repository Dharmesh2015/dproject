#!/usr/bin/env node
'use strict';
/**
 * DProject — extract-tasks.js
 *
 * Read an MSPDI XML file and print a one-line summary per task:
 * WBS · name · duration · start–finish · flags (S=summary, M=milestone, *=critical).
 *
 * Run:
 *   node examples/extract-tasks.js                          # uses sample-01.xml
 *   node examples/extract-tasks.js path/to/your-file.xml
 *
 * TS users: same code; types come from `dproject.d.ts`:
 *   import DProject, { Project, Task } from 'dproject';
 */

const path = require('path');
const DProject = require('../dproject');

const file = process.argv[2] || path.join(__dirname, '..', 'tests', 'fixtures', 'sample-01.xml');

DProject.fromFile(file).then(function (project) {
  /** @type {import('../dproject').Project} */
  const p = project;

  console.log('Project: ' + (p.meta.title || p.meta.name || '(untitled)'));
  console.log('Tasks:   ' + p.tasks.length);
  console.log('Window:  ' + (p.meta.startDate || '?') + ' → ' + (p.meta.finishDate || '?'));
  console.log('');

  const wbsW = Math.max(3, ...p.tasks.map(function (t) { return (t.wbs || '').length; }));
  const nameW = Math.min(48, Math.max(4, ...p.tasks.map(function (t) { return t.name.length; })));

  console.log(pad('WBS', wbsW) + '  ' + pad('Name', nameW) + '  ' + pad('Dur', 8) + '  ' + pad('Start', 10) + '  ' + pad('Finish', 10) + '  Flags');
  console.log('-'.repeat(wbsW + nameW + 8 + 10 + 10 + 10));

  p.tasks.forEach(function (t) {
    const indent = '  '.repeat(Math.max(0, t.outlineLevel - 1));
    const name = clip(indent + t.name, nameW);
    const dur = formatDuration(t.duration);
    const start = (t.start || '').slice(0, 10);
    const finish = (t.finish || '').slice(0, 10);
    let flags = '';
    if (t.summary)   flags += 'S';
    if (t.milestone) flags += 'M';
    if (t.critical)  flags += '*';

    console.log(pad(t.wbs || '', wbsW) + '  ' + pad(name, nameW) + '  ' + pad(dur, 8) + '  ' + pad(start, 10) + '  ' + pad(finish, 10) + '  ' + flags);
  });
}).catch(function (err) {
  console.error('Failed to read ' + file + ':');
  console.error(err.message);
  process.exit(1);
});

function pad(s, w) { s = String(s); return s.length >= w ? s : s + ' '.repeat(w - s.length); }
function clip(s, w) { return s.length <= w ? s : s.slice(0, w - 1) + '…'; }
function formatDuration(min) {
  if (!min) return '0';
  const days = min / 480; // MSPDI default: 8h workday
  if (days >= 1) return days.toFixed(days < 10 ? 1 : 0) + 'd';
  const hours = min / 60;
  if (hours >= 1) return hours.toFixed(hours < 10 ? 1 : 0) + 'h';
  return min + 'm';
}
