/* ESLint, run by CI. package.json has no dependencies on purpose, so the
 * workflow installs the pinned versions itself; see CLAUDE.md for running it
 * by hand. The recommended rules only: they look for mistakes - an undefined
 * name, a value written and never read - not for style, and nothing here
 * formats. */
import js from '@eslint/js';
import globals from 'globals';

/* The page's scripts parse as ES2017 and no newer, which is what keeps the
 * calculator running on browsers without later syntax: a script that fails to
 * parse loses the whole page, not just a feature. Raising this is a decision
 * about which browsers to drop, not a lint fix. */
const PAGE_ES = 2017;

export default [
  js.configs.recommended,
  {
    rules: {
      // `catch (e)` with `e` unused is how the page's scripts must write it:
      // leaving the binding out is ES2019 syntax.
      'no-unused-vars': ['error', { caughtErrors: 'none' }]
    }
  },
  {
    // The table: a plain browser script whose module.exports is guarded, so the
    // market function can require() it as well.
    files: ['commodities.js'],
    languageOptions: {
      ecmaVersion: PAGE_ES,
      sourceType: 'script',
      globals: { ...globals.browser, module: 'readonly' }
    }
  },
  {
    // A plain browser script loaded after the table and Chart.js, whose
    // globals it reads.
    files: ['app.js'],
    languageOptions: {
      ecmaVersion: PAGE_ES,
      sourceType: 'script',
      globals: { ...globals.browser, COMMODITIES: 'readonly', Chart: 'readonly' }
    },
    rules: {
      // Its top-level functions are globals, and a few exist for the tests
      // alone (strategyPnl, americanCritical), so only locals are checked.
      'no-unused-vars': ['error', { vars: 'local', caughtErrors: 'none' }]
    }
  },
  {
    files: ['api/**/*.js', 'test/**/*.js', 'scripts/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node }
  }
];
