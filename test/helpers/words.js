'use strict';

/* The words app.js asks t() for, read off its source. A key written as a
 * string literal, or literals joined with +, is a word the page's table can
 * hold; anything else is an expression, whose words come from data - a
 * market's label in commodities.js, a strategy's name, the market function's
 * own error messages. */

const vm = require('vm');

/* The source with its comments blanked, so a t() in prose is not read as a
 * call. Strings, template literals included, are kept as they are. */
function withoutComments(src) {
  let out = '', i = 0, quote = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (quote) {
      if (c === '\\') { out += c + n; i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++;
      continue;
    }
    if (c === '/' && (n === '*' || n === '/')) {
      const end = n === '*' ? src.indexOf('*/', i + 2) + 2 : src.indexOf('\n', i);
      out += src.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    out += c; i++;
  }
  return out;
}

const LITERAL = /^\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\$])*`)/;

/* The first argument of the call whose "(" is at `at`: a literal key, or the
 * expression's text. */
function firstArgument(src, at) {
  let i = at + 1, key = '', m;
  while ((m = LITERAL.exec(src.slice(i)))) {
    key += vm.runInNewContext(m[1]);
    i += m[0].length;
    const plus = /^\s*\+/.exec(src.slice(i));
    if (!plus) {
      if (/^\s*[,)]/.test(src.slice(i))) return { key };
      break;
    }
    i += plus[0].length;
  }
  // Not a literal: the expression up to the comma or bracket that ends it.
  let depth = 0, j = at + 1;
  for (; j < src.length; j++) {
    const c = src[j];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
    else if (c === ',' && depth === 0) break;
  }
  return { expression: src.slice(at + 1, j).trim() };
}

/* Every call of `fn` - t, or a helper that hands its argument to t - with
 * its key or its expression and the line it is on. */
function calls(src, fn) {
  const code = withoutComments(src);
  const out = [];
  const re = new RegExp('(^|[^\\w.$])' + fn + '\\(', 'g');
  let m;
  while ((m = re.exec(code))) {
    const at = m.index + m[0].length - 1;
    const line = code.slice(0, at).split('\n').length;
    out.push(Object.assign({ line }, firstArgument(code, at)));
  }
  return out;
}

module.exports = { calls, withoutComments };
