#!/usr/bin/env node
'use strict';
/**
 * DProject — modify-and-write.js
 *
 * Round-trip demo: parse → mutate → serialize → write to disk.
 *
 * What this example does:
 *   1. Loads an MSPDI XML file
 *   2. Tweaks the project title (suffix " — updated")
 *   3. Marks every milestone as 100% complete
 *   4. Writes the result to <basename>.out.xml in the examples/ folder
 *   5. Re-parses the output to prove the round-trip is lossless
 *
 * Run:
 *   node examples/modify-and-write.js                       # uses sample-01.xml
 *   node examples/modify-and-write.js path/to/file.xml      # custom input
 *   node examples/modify-and-write.js in.xml out.xml        # custom output too
 *
 * TS users: same code; types come from `dproject.d.ts`:
 *   import DProject, { Project, SerializeOptions } from 'dproject';
 */

const fs = require('fs');
const path = require('path');
const DProject = require('../dproject');

const inFile = process.argv[2] || path.join(__dirname, '..', 'tests', 'fixtures', 'sample-01.xml');
const outFile = process.argv[3]
  || path.join(__dirname, path.basename(inFile).replace(/\.xml$/i, '') + '.out.xml');

DProject.fromFile(inFile).then(function (project) {
  /** @type {import('../dproject').Project} */
  const p = project;

  const beforeTitle = p.meta.title;
  const milestones = p.tasks.filter(function (t) { return t.milestone; });
  const alreadyDone = milestones.filter(function (t) { return t.percentComplete === 100; }).length;

  // (1) Title tweak.
  p.meta.title = (p.meta.title || p.meta.name || 'Project') + ' — updated';

  // (2) Mark every milestone 100% done.
  milestones.forEach(function (t) {
    t.percentComplete = 100;
    t.percentWorkComplete = 100;
  });

  // (3) Serialize back to MSPDI XML.
  const xml = DProject.serialize(p, { pretty: true });
  fs.writeFileSync(outFile, xml, 'utf-8');

  // (4) Re-parse to confirm the round-trip is valid.
  const reparsed = DProject.parse(xml);
  const validation = DProject.validate(reparsed);
  const reparsedDone = reparsed.tasks
    .filter(function (t) { return t.milestone; })
    .filter(function (t) { return t.percentComplete === 100; }).length;

  console.log('Input:                 ' + path.basename(inFile));
  console.log('Output:                ' + outFile);
  console.log('Output size:           ' + xml.length + ' chars');
  console.log('');
  console.log('Title before:          ' + (beforeTitle || '(empty)'));
  console.log('Title after:           ' + reparsed.meta.title);
  console.log('Milestones found:      ' + milestones.length);
  console.log('Already 100% before:   ' + alreadyDone);
  console.log('100% after round-trip: ' + reparsedDone);
  console.log('Validates:             ' + (validation.ok ? '✓ yes' : '✗ ' + validation.errors.length + ' errors'));
  console.log('');
  if (!validation.ok) {
    console.log('✗ round-trip produced an invalid project — investigate');
  } else if (milestones.length === 0) {
    console.log('✓ round-trip valid (no milestones to mutate in this file)');
  } else if (reparsedDone === milestones.length) {
    console.log('✓ round-trip succeeded — ' + milestones.length + ' milestone(s) marked done');
  } else {
    console.log('✗ round-trip lost data — ' + reparsedDone + '/' + milestones.length + ' milestones survived');
  }
}).catch(function (err) {
  console.error('Failed:');
  console.error('  ' + err.message);
  process.exit(1);
});
