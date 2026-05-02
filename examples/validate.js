#!/usr/bin/env node
'use strict';
/**
 * DProject — validate.js
 *
 * Run the structural validator against an MSPDI XML file.
 * Prints errors grouped by code, exits non-zero on failure (CI-friendly).
 *
 * Run:
 *   node examples/validate.js                          # validates sample-01.xml
 *   node examples/validate.js path/to/your-file.xml
 *
 * Exit codes:
 *   0  → valid (no errors)
 *   1  → validation errors found
 *   2  → file could not be parsed
 *
 * TS users: same code; types come from `dproject.d.ts`:
 *   import DProject, { ValidationResult, ValidationError } from 'dproject';
 */

const path = require('path');
const DProject = require('../dproject');

const file = process.argv[2] || path.join(__dirname, '..', 'tests', 'fixtures', 'sample-01.xml');

DProject.fromFile(file).then(function (project) {
  const result = DProject.validate(project);

  console.log('File:    ' + path.basename(file));
  console.log('Tasks:   ' + project.tasks.length);
  console.log('Errors:  ' + result.errors.length);
  console.log('');

  if (result.ok) {
    console.log('✓ valid — no structural issues');
    process.exit(0);
  }

  // Group errors by code for readability.
  const byCode = new Map();
  result.errors.forEach(function (e) {
    if (!byCode.has(e.code)) byCode.set(e.code, []);
    byCode.get(e.code).push(e);
  });

  // Sort codes by frequency (most common first), stable for the rest.
  const codes = [...byCode.keys()].sort(function (a, b) {
    return byCode.get(b).length - byCode.get(a).length;
  });

  codes.forEach(function (code) {
    const list = byCode.get(code);
    console.log('[' + code + ']  ' + list.length + ' issue' + (list.length === 1 ? '' : 's'));
    list.slice(0, 10).forEach(function (e) {
      const where = formatWhere(e.where);
      console.log('  - ' + e.message + (where ? '   ' + where : ''));
    });
    if (list.length > 10) console.log('  … and ' + (list.length - 10) + ' more');
    console.log('');
  });

  console.log('All known codes: ' + Object.keys(DProject.ERROR_CODES).join(', '));
  process.exit(1);
}).catch(function (err) {
  console.error('Failed to parse ' + file + ':');
  console.error('  ' + err.message);
  process.exit(2);
});

function formatWhere(w) {
  if (!w) return '';
  const parts = [];
  if (w.taskUid != null)        parts.push('task=' + w.taskUid);
  if (w.resourceUid != null)    parts.push('resource=' + w.resourceUid);
  if (w.assignmentUid != null)  parts.push('assignment=' + w.assignmentUid);
  if (w.parentUid != null)      parts.push('parent=' + w.parentUid);
  if (w.predecessorUid != null) parts.push('predecessor=' + w.predecessorUid);
  return parts.length ? '(' + parts.join(', ') + ')' : '';
}
