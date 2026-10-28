/* The page's words in each language it is published in. app.js writes every
 * word a reader sees through t(), keyed by its English text, so the code still
 * reads in English and the English page needs no table. A page in another
 * language says so in <html lang>, and t() looks its words up here; anything
 * with no entry stays as written.
 *
 * {name} in a text is filled from t()'s second argument. A translation keeps
 * the same names, in whatever order its sentence needs them.
 *
 * Like commodities.js, a plain script with a guarded module.exports, so it works
 * as a browser global, from file:// too, and as a Node module. index.html loads
 * it before app.js. */

const TRANSLATIONS = {};

/* The language the page is written in: the first part of <html lang>. */
const PAGE_LANG = (typeof document !== 'undefined' && document.documentElement &&
  typeof document.documentElement.lang === 'string' && document.documentElement.lang.slice(0, 2).toLowerCase()) || 'en';

function t(text, params) {
  const table = Object.prototype.hasOwnProperty.call(TRANSLATIONS, PAGE_LANG) ? TRANSLATIONS[PAGE_LANG] : null;
  const s = table && Object.prototype.hasOwnProperty.call(table, text) ? table[text] : text;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m));
}

if (typeof module !== 'undefined' && module.exports) module.exports = { TRANSLATIONS, PAGE_LANG, t };
