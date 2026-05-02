'use strict';
/**
 * DProject — MS Project (MSPDI XML) reader for JavaScript / TypeScript.
 *
 *   v0.1 spike — read MSPDI XML, return a clean Project shape.
 *
 * Public API:
 *   DProject.parse(xmlString)            -> Project
 *   DProject.fromFile(blobOrFile)        -> Promise<Project>     (browser/Node)
 *   DProject.fromUrl(url, fetchOptions?) -> Promise<Project>
 *   DProject.version
 *
 * Project shape:
 *   {
 *     meta:        { name, title, author, startDate, finishDate, currencySymbol, ... },
 *     tasks:       [ { uid, id, name, start, finish, duration, outlineLevel, parentUid,
 *                      predecessors: [ { predecessorUid, type, typeName, lag, ... } ], ... } ],
 *     resources:   [ { uid, id, name, type, maxUnits, standardRate, ... } ],
 *     assignments: [ { taskUid, resourceUid, units, work, cost, ... } ],
 *   }
 *
 * Durations are minutes (number). Dates are ISO 8601 strings (no Date objects)
 * so the result is JSON-serializable across browser, Node, and worker contexts.
 *
 * License: MIT — see LICENSE.
 * Copyright (c) 2026 Dharmesh Patel.
 */

const _xml = (typeof require !== 'undefined') ? require('./src/xml') : (typeof window !== 'undefined' ? window.DProjectXML : null);
const _parser = (typeof require !== 'undefined') ? require('./src/parser') : (typeof window !== 'undefined' ? window.DProjectParser : null);
const _normalizer = (typeof require !== 'undefined') ? require('./src/normalizer') : (typeof window !== 'undefined' ? window.DProjectNormalizer : null);
const _validator = (typeof require !== 'undefined') ? require('./src/validator') : (typeof window !== 'undefined' ? window.DProjectValidator : null);
const _serializer = (typeof require !== 'undefined') ? require('./src/serializer') : (typeof window !== 'undefined' ? window.DProjectSerializer : null);

const VERSION = '1.0.6';

function parse(xmlString) {
  if (typeof xmlString !== 'string') {
    throw new TypeError('DProject.parse: expected string, got ' + typeof xmlString);
  }
  if (xmlString.length === 0) {
    throw new Error('DProject.parse: empty input');
  }
  const tree = _xml.parseXML(xmlString);
  const raw = _parser.extractRawProject(tree);
  return _normalizer.normalizeProject(raw);
}

function _readBlobAsText(blob) {
  if (typeof Response !== 'undefined') {
    return new Response(blob).text();
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(fr.error || new Error('FileReader failed')); };
      fr.readAsText(blob, 'utf-8');
    });
  }
  return Promise.reject(new Error('DProject.fromFile: no Response or FileReader in this runtime'));
}

function fromFile(input) {
  if (input == null) return Promise.reject(new TypeError('DProject.fromFile: missing argument'));
  if (typeof input === 'string') {
    if (typeof require !== 'undefined') {
      try {
        const fs = require('fs');
        return Promise.resolve(fs.readFileSync(input, 'utf-8')).then(parse);
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return Promise.reject(new Error('DProject.fromFile: string path requires Node fs'));
  }
  return _readBlobAsText(input).then(parse);
}

function fromUrl(url, opts) {
  if (typeof fetch !== 'function') {
    return Promise.reject(new Error('DProject.fromUrl: global fetch is not available'));
  }
  return fetch(url, opts || {}).then(function (r) {
    if (!r.ok) throw new Error('DProject.fromUrl: HTTP ' + r.status + ' ' + r.statusText);
    return r.text();
  }).then(parse);
}

function validate(project, opts) {
  return _validator.validate(project, opts);
}

function serialize(project, opts) {
  return _serializer.serialize(project, opts);
}

const DProject = {
  parse: parse,
  fromFile: fromFile,
  fromUrl: fromUrl,
  validate: validate,
  serialize: serialize,
  ERROR_CODES: _validator.ERROR_CODES,
  version: VERSION,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DProject;
}
if (typeof window !== 'undefined') {
  window.DProject = DProject;
}
