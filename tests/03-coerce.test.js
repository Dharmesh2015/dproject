#!/usr/bin/env node
'use strict';
/**
 * DProject — 03 type coercion unit tests (Gate 1).
 */

const c = require('../src/types/coerce');

let pass = 0, fail = 0;
function it(name, fn) {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '\n     ' + (e.stack || e.message)); fail++; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'eq') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}

console.log('═'.repeat(60));
console.log('  DProject — 03-coerce');
console.log('═'.repeat(60));

// ── asString ─────────────────────────────────────────────────────────────────
it('asString("x") = "x"', function () { eq(c.asString('x'), 'x'); });
it('asString("") = ""', function () { eq(c.asString(''), ''); });
it('asString(null) = ""', function () { eq(c.asString(null), ''); });
it('asString(undefined) = ""', function () { eq(c.asString(undefined), ''); });
it('asString(42) coerces to "42"', function () { eq(c.asString(42), '42'); });

// ── asInt ────────────────────────────────────────────────────────────────────
it('asInt("0") = 0', function () { eq(c.asInt('0'), 0); });
it('asInt("42") = 42', function () { eq(c.asInt('42'), 42); });
it('asInt("-5") = -5', function () { eq(c.asInt('-5'), -5); });
it('asInt("3.7") = 3 (truncates)', function () { eq(c.asInt('3.7'), 3); });
it('asInt("") = 0', function () { eq(c.asInt(''), 0); });
it('asInt(null) = 0', function () { eq(c.asInt(null), 0); });
it('asInt("garbage") = 0', function () { eq(c.asInt('garbage'), 0); });

// ── asFloat ──────────────────────────────────────────────────────────────────
it('asFloat("3.14") = 3.14', function () { eq(c.asFloat('3.14'), 3.14); });
it('asFloat("-0.5") = -0.5', function () { eq(c.asFloat('-0.5'), -0.5); });
it('asFloat("1e3") = 1000', function () { eq(c.asFloat('1e3'), 1000); });
it('asFloat("") = 0', function () { eq(c.asFloat(''), 0); });
it('asFloat("garbage") = 0', function () { eq(c.asFloat('garbage'), 0); });

// ── asBool ───────────────────────────────────────────────────────────────────
it('asBool("1") = true', function () { eq(c.asBool('1'), true); });
it('asBool("0") = false', function () { eq(c.asBool('0'), false); });
it('asBool("true") = true', function () { eq(c.asBool('true'), true); });
it('asBool("TRUE") = true', function () { eq(c.asBool('TRUE'), true); });
it('asBool("True") = true', function () { eq(c.asBool('True'), true); });
it('asBool("false") = false', function () { eq(c.asBool('false'), false); });
it('asBool("") = false', function () { eq(c.asBool(''), false); });
it('asBool(null) = false', function () { eq(c.asBool(null), false); });

// ── asDate ───────────────────────────────────────────────────────────────────
it('asDate keeps ISO string as-is', function () {
  eq(c.asDate('2004-04-12T08:00:00'), '2004-04-12T08:00:00');
});
it('asDate("") = null', function () { eq(c.asDate(''), null); });
it('asDate(null) = null', function () { eq(c.asDate(null), null); });

// ── asDurationMinutes (ISO 8601 PT) ──────────────────────────────────────────
it('PT0H0M0S = 0', function () { eq(c.asDurationMinutes('PT0H0M0S'), 0); });
it('PT8H0M0S = 480 (1 work day)', function () { eq(c.asDurationMinutes('PT8H0M0S'), 480); });
it('PT636H0M0S = 38160', function () { eq(c.asDurationMinutes('PT636H0M0S'), 38160); });
it('PT1H30M0S = 90', function () { eq(c.asDurationMinutes('PT1H30M0S'), 90); });
it('PT0H0M30S = 0.5', function () { eq(c.asDurationMinutes('PT0H0M30S'), 0.5); });
it('P1DT0H0M0S = 1440 (1 day)', function () { eq(c.asDurationMinutes('P1DT0H0M0S'), 1440); });
it('PT45M = 45 (just minutes)', function () { eq(c.asDurationMinutes('PT45M'), 45); });
it('PT2H = 120 (just hours)', function () { eq(c.asDurationMinutes('PT2H'), 120); });
it('"" = 0', function () { eq(c.asDurationMinutes(''), 0); });
it('null = 0', function () { eq(c.asDurationMinutes(null), 0); });
it('"garbage" = 0', function () { eq(c.asDurationMinutes('garbage'), 0); });
it('"PT" alone = 0', function () { eq(c.asDurationMinutes('PT'), 0); });

// ── Dependency types ─────────────────────────────────────────────────────────
it('asDepType("0") = 0 (FF)', function () { eq(c.asDepType('0'), 0); });
it('asDepType("1") = 1 (FS — most common)', function () { eq(c.asDepType('1'), 1); });
it('asDepType("2") = 2 (SF)', function () { eq(c.asDepType('2'), 2); });
it('asDepType("3") = 3 (SS)', function () { eq(c.asDepType('3'), 3); });
it('asDepType("99") falls back to 1 (FS)', function () { eq(c.asDepType('99'), 1); });
it('asDepType("") falls back to 1', function () { eq(c.asDepType(''), 1); });

it('depTypeName(0) = "FF"', function () { eq(c.depTypeName(0), 'FF'); });
it('depTypeName(1) = "FS"', function () { eq(c.depTypeName(1), 'FS'); });
it('depTypeName(2) = "SF"', function () { eq(c.depTypeName(2), 'SF'); });
it('depTypeName(3) = "SS"', function () { eq(c.depTypeName(3), 'SS'); });
it('depTypeName(99) falls back to "FS"', function () { eq(c.depTypeName(99), 'FS'); });

// ── Lag (tenths-of-minute → minutes) ─────────────────────────────────────────
it('asLagMinutes("0") = 0', function () { eq(c.asLagMinutes('0'), 0); });
it('asLagMinutes("4800") = 480 (1 work day)', function () { eq(c.asLagMinutes('4800'), 480); });
it('asLagMinutes("600") = 60 (1 hour)', function () { eq(c.asLagMinutes('600'), 60); });
it('asLagMinutes("") = 0', function () { eq(c.asLagMinutes(''), 0); });

// ── Constraint names ─────────────────────────────────────────────────────────
it('constraintName(0) = ASAP', function () { eq(c.constraintName(0), 'ASAP'); });
it('constraintName(4) = SNET', function () { eq(c.constraintName(4), 'SNET'); });
it('constraintName(7) = FNLT', function () { eq(c.constraintName(7), 'FNLT'); });
it('constraintName(99) falls back to ASAP', function () { eq(c.constraintName(99), 'ASAP'); });

console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + pass + '/' + (pass + fail));
console.log('─'.repeat(60));
if (fail > 0) process.exit(1);
