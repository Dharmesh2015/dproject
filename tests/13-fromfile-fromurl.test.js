#!/usr/bin/env node
'use strict';
/**
 * DProject — 13 fromFile() / fromUrl() integration tests.
 *
 * Covers the public-API entry points beyond DProject.parse(string):
 *   - fromFile(absPath)          (Node)
 *   - fromFile(Blob)             (browser-like, via global Response)
 *   - fromUrl(url)               (uses fetch — Node 18+ has it built in)
 *
 * If fetch is missing in the runtime, fromUrl tests are skipped advisory.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const DProject = require('../dproject');

let pass = 0, fail = 0, skip = 0;
function it(name, fn) {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '\n     ' + (e.stack || e.message)); fail++; }
}
async function itAsync(name, fn) {
  try { await fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '\n     ' + (e.stack || e.message)); fail++; }
}
function eq(a, b, m) {
  if (a !== b) throw new Error((m || 'eq') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }

const FIXTURE = path.join(__dirname, 'fixtures', 'sample-01.xml');
const FIXTURE_BYTES = fs.readFileSync(FIXTURE);
const FIXTURE_TEXT  = FIXTURE_BYTES.toString('utf-8');

console.log('═'.repeat(60));
console.log('  DProject — 13 fromFile / fromUrl');
console.log('═'.repeat(60));

(async function () {

  // ── fromFile(absolutePath) ─ Node ──────────────────────────────────────────
  console.log('\n  [fromFile(absPath) — Node]');
  await itAsync('reads sample-01.xml from absolute path', async function () {
    const p = await DProject.fromFile(FIXTURE);
    eq(p.tasks.length, 121);
    eq(p.resources.length, 3);
  });

  await itAsync('rejects on missing file path', async function () {
    let threw = false;
    try { await DProject.fromFile('/tmp/__does_not_exist__.xml'); } catch (e) { threw = true; }
    eq(threw, true);
  });

  await itAsync('rejects on null/undefined input', async function () {
    let threw = false;
    try { await DProject.fromFile(null); } catch (e) { threw = true; }
    eq(threw, true);
  });

  // ── fromFile(Blob-like) ────────────────────────────────────────────────────
  // Node 18+ has global Response; we simulate a Blob by passing one.
  console.log('\n  [fromFile(Blob-like)]');
  if (typeof Blob !== 'undefined' && typeof Response !== 'undefined') {
    await itAsync('reads from a Blob', async function () {
      const blob = new Blob([FIXTURE_TEXT], { type: 'application/xml' });
      const p = await DProject.fromFile(blob);
      eq(p.tasks.length, 121);
    });
    await itAsync('reads from a Buffer-like (Uint8Array)', async function () {
      const blob = new Blob([new Uint8Array(FIXTURE_BYTES)], { type: 'application/xml' });
      const p = await DProject.fromFile(blob);
      eq(p.tasks.length, 121);
    });
  } else {
    console.log('  ⊖ Blob/Response unavailable in this Node version — skip');
    skip += 2;
  }

  // ── fromUrl() ─ requires global fetch ──────────────────────────────────────
  console.log('\n  [fromUrl() — needs global fetch]');
  if (typeof fetch !== 'function') {
    console.log('  ⊖ fetch not available — skip fromUrl tests');
    skip += 3;
  } else {
    // Spin up a tiny local server that serves the fixture
    const server = http.createServer(function (req, res) {
      if (req.url === '/sample.xml') {
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end(FIXTURE_TEXT);
      } else if (req.url === '/notfound.xml') {
        res.writeHead(404);
        res.end('not found');
      } else {
        res.writeHead(500);
        res.end('boom');
      }
    });
    await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    const baseUrl = 'http://127.0.0.1:' + port;

    await itAsync('fetches and parses XML over HTTP', async function () {
      const p = await DProject.fromUrl(baseUrl + '/sample.xml');
      eq(p.tasks.length, 121);
    });

    await itAsync('rejects on HTTP 404', async function () {
      let threw = false;
      try { await DProject.fromUrl(baseUrl + '/notfound.xml'); } catch (e) { threw = true; }
      eq(threw, true);
    });

    await itAsync('rejects on HTTP 500', async function () {
      let threw = false;
      try { await DProject.fromUrl(baseUrl + '/boom.xml'); } catch (e) { threw = true; }
      eq(threw, true);
    });

    await new Promise(function (resolve) { server.close(resolve); });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('  Results: ' + pass + '/' + (pass + fail) + (skip ? ' (' + skip + ' skipped)' : ''));
  console.log('─'.repeat(60));
  if (fail > 0) process.exit(1);
})();
