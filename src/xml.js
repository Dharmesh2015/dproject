'use strict';
/**
 * DProject — minimal pure-JS XML tokenizer.
 *
 * Returns a tree of nodes: { name, attrs, children, text }.
 * - Strips XML declaration, processing instructions, comments.
 * - Strips namespace prefixes ("ns:Tag" -> "Tag"); xmlns attrs preserved on root.
 * - Decodes the 5 standard entities + numeric character references.
 * - Concatenates whitespace-trimmed text inside leaf elements.
 *
 * Designed for MSPDI (well-formed, no DTD, no CDATA, no mixed content).
 * For v1.0 we may swap to streaming; for v0.x in-memory tree is fine.
 *
 * Public:
 *   parseXML(str) -> rootNode
 */

function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, function (_m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_m, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&amp;/g, '&');
}

function stripNs(name) {
  const c = name.indexOf(':');
  return c >= 0 ? name.substring(c + 1) : name;
}

function makeNode(name, attrs) {
  return { name: name, attrs: attrs, children: [], text: '' };
}

function parseXML(str) {
  if (typeof str !== 'string') throw new TypeError('parseXML: expected string');
  const len = str.length;
  let i = 0;

  if (len > 0 && str.charCodeAt(0) === 0xFEFF) i = 1;

  function isWs(c) { return c === 32 || c === 9 || c === 10 || c === 13; }
  function skipWS() { while (i < len && isWs(str.charCodeAt(i))) i++; }

  function trySkipPI() {
    if (str.charCodeAt(i) === 60 /*<*/ && str.charCodeAt(i + 1) === 63 /*?*/) {
      const end = str.indexOf('?>', i);
      if (end < 0) throw new Error('DProject: unterminated processing instruction');
      i = end + 2;
      return true;
    }
    return false;
  }

  function trySkipComment() {
    if (str.charCodeAt(i) === 60 && str.charCodeAt(i + 1) === 33 /*!*/ &&
        str.charCodeAt(i + 2) === 45 /*-*/ && str.charCodeAt(i + 3) === 45) {
      const end = str.indexOf('-->', i + 4);
      if (end < 0) throw new Error('DProject: unterminated comment');
      i = end + 3;
      return true;
    }
    return false;
  }

  function trySkipDoctype() {
    if (str.substr(i, 9).toUpperCase() === '<!DOCTYPE') {
      let depth = 1;
      i += 9;
      while (i < len && depth > 0) {
        const ch = str.charCodeAt(i);
        if (ch === 60) depth++;
        else if (ch === 62) depth--;
        i++;
      }
      return true;
    }
    return false;
  }

  // Returns literal CDATA text if matched, else null. Caller appends to current node.
  function tryReadCDATA() {
    if (str.substr(i, 9) === '<![CDATA[') {
      const end = str.indexOf(']]>', i + 9);
      if (end < 0) throw new Error('DProject: unterminated CDATA section');
      const content = str.substring(i + 9, end);
      i = end + 3;
      return content;
    }
    return null;
  }

  function readOpenTag() {
    i++;
    const nameStart = i;
    while (i < len) {
      const ch = str.charCodeAt(i);
      if (isWs(ch) || ch === 47 /*/*/ || ch === 62 /*>*/) break;
      i++;
    }
    const name = stripNs(str.substring(nameStart, i));
    const attrs = {};
    while (i < len) {
      skipWS();
      const ch = str.charCodeAt(i);
      if (ch === 47 || ch === 62) break;
      const aStart = i;
      while (i < len) {
        const c = str.charCodeAt(i);
        if (isWs(c) || c === 61 /*=*/ || c === 47 || c === 62) break;
        i++;
      }
      const aName = str.substring(aStart, i);
      let aVal = '';
      skipWS();
      if (str.charCodeAt(i) === 61) {
        i++;
        skipWS();
        const q = str.charCodeAt(i);
        if (q !== 34 /*"*/ && q !== 39 /*'*/) throw new Error('DProject: expected quoted attribute value at ' + i);
        i++;
        const vStart = i;
        while (i < len && str.charCodeAt(i) !== q) i++;
        if (i >= len) throw new Error('DProject: unterminated attribute value');
        aVal = decodeEntities(str.substring(vStart, i));
        i++;
      }
      if (aName) attrs[aName] = aVal;
    }
    let selfClosing = false;
    if (str.charCodeAt(i) === 47) { selfClosing = true; i++; }
    if (str.charCodeAt(i) !== 62) throw new Error('DProject: expected `>` at ' + i);
    i++;
    return { name: name, attrs: attrs, selfClosing: selfClosing };
  }

  function readCloseTagName() {
    i += 2;
    const start = i;
    while (i < len && str.charCodeAt(i) !== 62) i++;
    if (str.charCodeAt(i) !== 62) throw new Error('DProject: unterminated close tag');
    const name = stripNs(str.substring(start, i).replace(/\s+$/, ''));
    i++;
    return name;
  }

  function readText() {
    const start = i;
    while (i < len && str.charCodeAt(i) !== 60) i++;
    return decodeEntities(str.substring(start, i));
  }

  while (i < len) {
    skipWS();
    if (i >= len) break;
    if (str.charCodeAt(i) === 60) {
      const next = str.charCodeAt(i + 1);
      if (next === 63) { trySkipPI(); continue; }
      if (next === 33) {
        if (trySkipComment()) continue;
        if (trySkipDoctype()) continue;
        throw new Error('DProject: unsupported <! construct at ' + i);
      }
      break;
    } else {
      i++;
    }
  }

  if (i >= len || str.charCodeAt(i) !== 60) throw new Error('DProject: no root element found');
  const rootInfo = readOpenTag();
  const root = makeNode(rootInfo.name, rootInfo.attrs);
  if (rootInfo.selfClosing) return root;
  const stack = [root];

  while (i < len && stack.length > 0) {
    const ch = str.charCodeAt(i);
    if (ch === 60) {
      const next = str.charCodeAt(i + 1);
      if (next === 47) {
        const closeName = readCloseTagName();
        const top = stack[stack.length - 1];
        if (top.name !== closeName) {
          throw new Error('DProject: mismatched close tag — expected </' + top.name + '>, got </' + closeName + '>');
        }
        stack.pop();
        continue;
      }
      if (next === 63) { trySkipPI(); continue; }
      if (next === 33) {
        const cdata = tryReadCDATA();
        if (cdata !== null) {
          const top = stack[stack.length - 1];
          top.text = top.text ? top.text + cdata : cdata;
          continue;
        }
        if (trySkipComment()) continue;
        if (trySkipDoctype()) continue;
        throw new Error('DProject: unsupported <! at ' + i);
      }
      const t = readOpenTag();
      const node = makeNode(t.name, t.attrs);
      stack[stack.length - 1].children.push(node);
      if (!t.selfClosing) stack.push(node);
    } else {
      const text = readText();
      const trimmed = text.replace(/^\s+|\s+$/g, '');
      if (trimmed.length > 0) {
        const top = stack[stack.length - 1];
        top.text = top.text ? top.text + trimmed : trimmed;
      }
    }
  }

  if (stack.length > 0) throw new Error('DProject: unclosed elements: ' + stack.map(function (n) { return n.name; }).join(','));

  return root;
}

function getChild(node, name) {
  if (!node || !node.children) return null;
  const cs = node.children;
  for (let k = 0; k < cs.length; k++) if (cs[k].name === name) return cs[k];
  return null;
}

function getChildren(node, name) {
  const out = [];
  if (!node || !node.children) return out;
  const cs = node.children;
  for (let k = 0; k < cs.length; k++) if (cs[k].name === name) out.push(cs[k]);
  return out;
}

function txt(node, name) {
  const c = getChild(node, name);
  return c ? c.text : '';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseXML: parseXML, getChild: getChild, getChildren: getChildren, txt: txt };
}
if (typeof window !== 'undefined') {
  window.DProjectXML = { parseXML: parseXML, getChild: getChild, getChildren: getChildren, txt: txt };
}
