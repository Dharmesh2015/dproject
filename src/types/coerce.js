'use strict';
/**
 * DProject — type coercion primitives.
 * One concern per function. Each is pure, total, and never throws on bad input —
 * returns null/zero defaults so a single bad field never breaks the whole parse.
 */

function asString(s) {
  return s == null ? '' : String(s);
}

function asInt(s) {
  if (s == null || s === '') return 0;
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

function asFloat(s) {
  if (s == null || s === '') return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function asBool(s) {
  return s === '1' || s === 'true' || s === 'TRUE' || s === 'True';
}

/**
 * MSPDI dates: ISO 8601 local date-time without timezone, e.g. 2004-04-12T08:00:00.
 * Return as-is (string) so the Project shape is JSON-serializable across runtimes.
 * Consumers can `new Date(s)` themselves; we don't bind to a timezone here.
 */
function asDate(s) {
  if (!s) return null;
  return String(s);
}

/**
 * MSPDI durations: ISO 8601 "PnYnMnDTnHnMnS". MSPDI only emits PT-form
 * (hours/minutes/seconds), e.g. PT636H0M0S. We also tolerate PnDTnHnMnS just in case.
 * Returns total minutes (number). Returns 0 for empty / unparseable.
 */
function asDurationMinutes(s) {
  if (!s) return 0;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s);
  if (!m) return 0;
  const days = m[1] ? parseInt(m[1], 10) : 0;
  const hours = m[2] ? parseInt(m[2], 10) : 0;
  const mins = m[3] ? parseInt(m[3], 10) : 0;
  const secs = m[4] ? parseFloat(m[4]) : 0;
  return days * 24 * 60 + hours * 60 + mins + secs / 60;
}

/**
 * MSPDI dependency Type codes:
 *   0 = FF (Finish-to-Finish)
 *   1 = FS (Finish-to-Start)  — most common, MS Project default
 *   2 = SF (Start-to-Finish)  — rare
 *   3 = SS (Start-to-Start)
 */
const DEP_TYPE_NAMES = ['FF', 'FS', 'SF', 'SS'];

function asDepType(s) {
  if (s == null || s === '') return 1; // missing => FS default
  const n = asInt(s);
  return n >= 0 && n < 4 ? n : 1;
}

function depTypeName(n) {
  return DEP_TYPE_NAMES[n] || 'FS';
}

/**
 * MSPDI LinkLag is in tenths of a minute (per spec). e.g. 4800 = 480 minutes = 1 working day.
 * Return whole minutes.
 */
function asLagMinutes(s) {
  return asInt(s) / 10;
}

/**
 * MSPDI ConstraintType:
 *   0 = ASAP, 1 = ALAP, 2 = MSO, 3 = MFO, 4 = SNET, 5 = SNLT, 6 = FNET, 7 = FNLT, 8 = MOO
 */
const CONSTRAINT_NAMES = ['ASAP', 'ALAP', 'MSO', 'MFO', 'SNET', 'SNLT', 'FNET', 'FNLT', 'MOO'];

function constraintName(n) {
  return CONSTRAINT_NAMES[n] || 'ASAP';
}

var _coerceExports = {
  asString: asString,
  asInt: asInt,
  asFloat: asFloat,
  asBool: asBool,
  asDate: asDate,
  asDurationMinutes: asDurationMinutes,
  asDepType: asDepType,
  depTypeName: depTypeName,
  asLagMinutes: asLagMinutes,
  constraintName: constraintName,
  DEP_TYPE_NAMES: DEP_TYPE_NAMES,
  CONSTRAINT_NAMES: CONSTRAINT_NAMES,
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _coerceExports;
}
if (typeof window !== 'undefined') {
  window.DProjectCoerce = _coerceExports;
}
