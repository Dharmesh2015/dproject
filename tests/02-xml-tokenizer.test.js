#!/usr/bin/env node
'use strict';
/**
 * DProject — 02 XML tokenizer unit tests (Gate 1 — coverage of src/xml.js).
 */

const { parseXML, getChild, getChildren, txt } = require('../src/xml');

let pass = 0, fail = 0;
function it(name, fn) {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '\n     ' + (e.stack || e.message)); fail++; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'eq') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function throws(fn, m) {
  let t = false; try { fn(); } catch (e) { t = true; }
  if (!t) throw new Error(m || 'expected throw');
}

console.log('═'.repeat(60));
console.log('  DProject — 02-xml-tokenizer');
console.log('═'.repeat(60));

// ── Element basics ───────────────────────────────────────────────────────────
it('parses <a/>', function () {
  const r = parseXML('<a/>');
  eq(r.name, 'a'); eq(r.children.length, 0); eq(r.text, '');
});

it('parses <a></a>', function () {
  const r = parseXML('<a></a>');
  eq(r.name, 'a'); eq(r.children.length, 0);
});

it('parses <a>hello</a>', function () {
  const r = parseXML('<a>hello</a>');
  eq(r.text, 'hello');
});

it('parses nested <a><b>x</b></a>', function () {
  const r = parseXML('<a><b>x</b></a>');
  eq(r.children.length, 1);
  eq(r.children[0].name, 'b');
  eq(r.children[0].text, 'x');
});

// ── Attributes ───────────────────────────────────────────────────────────────
it('reads single attribute', function () {
  const r = parseXML('<a x="1"/>');
  eq(r.attrs.x, '1');
});

it('reads multiple attributes', function () {
  const r = parseXML('<a x="1" y="2" z="3"/>');
  eq(r.attrs.x, '1'); eq(r.attrs.y, '2'); eq(r.attrs.z, '3');
});

it('reads single-quoted attributes', function () {
  const r = parseXML("<a x='hello'/>");
  eq(r.attrs.x, 'hello');
});

it('reads attribute with whitespace around =', function () {
  const r = parseXML('<a x = "1" />');
  eq(r.attrs.x, '1');
});

// ── XML declarations / PIs / comments ────────────────────────────────────────
it('skips <?xml version="1.0"?>', function () {
  const r = parseXML('<?xml version="1.0"?><a/>');
  eq(r.name, 'a');
});

it('skips <?xml-stylesheet ... ?>', function () {
  const r = parseXML('<?xml version="1.0"?><?xml-stylesheet href="x.xsl"?><a/>');
  eq(r.name, 'a');
});

it('skips <!-- comment -->', function () {
  const r = parseXML('<!-- pre --><a><!-- mid --><b/></a><!-- post -->');
  eq(r.name, 'a'); eq(r.children.length, 1);
});

it('skips <!DOCTYPE ...>', function () {
  const r = parseXML('<!DOCTYPE foo SYSTEM "x.dtd"><a/>');
  eq(r.name, 'a');
});

// ── CDATA ────────────────────────────────────────────────────────────────────
it('reads CDATA literally', function () {
  const r = parseXML('<a><![CDATA[<not>parsed</not> & raw]]></a>');
  eq(r.text, '<not>parsed</not> & raw');
});

it('CDATA preserves entities (no decoding)', function () {
  const r = parseXML('<a><![CDATA[&amp; &lt;]]></a>');
  eq(r.text, '&amp; &lt;');
});

// ── Entities ─────────────────────────────────────────────────────────────────
it('decodes &amp; &lt; &gt; &quot; &apos;', function () {
  const r = parseXML('<a>&amp;&lt;&gt;&quot;&apos;</a>');
  eq(r.text, '&<>"\'');
});

it('decodes numeric entity &#65;', function () {
  const r = parseXML('<a>&#65;</a>');
  eq(r.text, 'A');
});

it('decodes hex entity &#x41;', function () {
  const r = parseXML('<a>&#x41;</a>');
  eq(r.text, 'A');
});

it('decodes entities in attributes', function () {
  const r = parseXML('<a x="&amp;&lt;"/>');
  eq(r.attrs.x, '&<');
});

// ── Namespaces ───────────────────────────────────────────────────────────────
it('strips namespace prefix from element name', function () {
  const r = parseXML('<ns:Project xmlns:ns="urn:x"><ns:Task/></ns:Project>');
  eq(r.name, 'Project'); eq(r.children[0].name, 'Task');
});

it('preserves xmlns attribute on root', function () {
  const r = parseXML('<Project xmlns="http://schemas.microsoft.com/project"/>');
  eq(r.attrs.xmlns, 'http://schemas.microsoft.com/project');
});

// ── BOM ──────────────────────────────────────────────────────────────────────
it('strips UTF-8 BOM', function () {
  const r = parseXML('﻿<a/>');
  eq(r.name, 'a');
});

// ── Whitespace handling ──────────────────────────────────────────────────────
it('trims whitespace-only text', function () {
  const r = parseXML('<a>\n  <b>x</b>\n</a>');
  eq(r.text, '');
});

it('preserves text in leaf', function () {
  const r = parseXML('<a>  hello  </a>');
  eq(r.text, 'hello');
});

// ── Helpers ──────────────────────────────────────────────────────────────────
it('getChild finds by name', function () {
  const r = parseXML('<a><b/><c><x/></c></a>');
  eq(getChild(r, 'c').name, 'c');
});

it('getChild returns null when missing', function () {
  const r = parseXML('<a><b/></a>');
  eq(getChild(r, 'z'), null);
});

it('getChildren returns all matches', function () {
  const r = parseXML('<a><x/><x/><y/><x/></a>');
  eq(getChildren(r, 'x').length, 3);
});

it('txt returns text of named child', function () {
  const r = parseXML('<a><b>hello</b></a>');
  eq(txt(r, 'b'), 'hello');
});

it('txt returns empty for missing child', function () {
  const r = parseXML('<a/>');
  eq(txt(r, 'b'), '');
});

// ── Errors ───────────────────────────────────────────────────────────────────
it('throws on unterminated comment', function () {
  throws(function () { parseXML('<!-- unterminated'); });
});

it('throws on mismatched close tag', function () {
  throws(function () { parseXML('<a></b>'); });
});

it('throws on no root element', function () {
  throws(function () { parseXML(''); });
});

it('throws on non-string input', function () {
  throws(function () { parseXML(null); });
  throws(function () { parseXML(123); });
});

it('throws on unterminated attribute value', function () {
  throws(function () { parseXML('<a x="hello'); });
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + pass + '/' + (pass + fail));
console.log('─'.repeat(60));
if (fail > 0) process.exit(1);
