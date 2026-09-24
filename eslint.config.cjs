const globals = require('./apps/api/node_modules/globals');
module.exports = [
  { ignores: ['**/node_modules/**', '**/dist/**', '.local*/**'] },
  { files: ['apps/api/**/*.js', 'packages/engine/**/*.js', 'scripts/**/*.cjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node, ...globals.jest } },
    rules: { 'no-undef': 'error', 'no-unreachable': 'error', 'no-constant-condition': 'error',
      'no-dupe-keys': 'error', 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] } },
];
