// Type-aware ESLint. The decisions behind this file:
//  - `recommendedTypeChecked` is on because this project's most expensive bugs
//    are type-shaped ones (a floating promise that never wrote storage, an
//    unawaited read-modify-write). Rules that need the type checker are the
//    whole point; a syntax-only rule set would not have caught them.
//  - `react-hooks` keeps its own upstream implementation rather than a ported
//    one: this project's history is a stale-closure regression, and that is
//    exactly what `exhaustive-deps` exists to catch.
//  - TypeScript is pinned to the 6.x line *because* of this file: the latest
//    typescript-eslint peer range is `>=4.8.4 <6.1.0`, so moving to the native
//    TypeScript 7 compiler would mean giving up type-aware linting. Revisit
//    when typescript-eslint widens that range.
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.wxt/**',
      '.output/**',
      'node_modules/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'eslint.config.js',
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        // `projectService` (not `project`) so files are only type-checked when
        // they belong to a tsconfig; a stray file outside `include` then fails
        // with a real message instead of a confusing "file not in project".
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'import-x': importX,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // Layer direction: contract/domain must never reach into platform or
      // features, and platform must never reach into features. Without this
      // rule the new repo grows back the god-hook it was written to replace.
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/contract',
              from: './src/domain',
              message: 'contract must not import domain',
            },
            {
              target: './src/contract',
              from: './src/platform',
              message: 'contract must not import platform',
            },
            {
              target: './src/contract',
              from: './src/entrypoints',
              message: 'contract must not import entrypoints',
            },
            {
              target: './src/domain',
              from: './src/platform',
              message: 'domain must not import platform',
            },
            {
              target: './src/domain',
              from: './src/entrypoints',
              message: 'domain must not import entrypoints',
            },
            {
              target: './src/platform',
              from: './src/entrypoints',
              message: 'platform must not import entrypoints',
            },
          ],
        },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['src/entrypoints/**/*.tsx', 'src/ui/**/*.tsx'],
    rules: {},
  },
  {
    ...jsxA11y.flatConfigs.recommended,
    files: ['**/*.tsx'],
  },
  {
    files: ['tests/**/*.ts', 'e2e/**/*.ts', '**/*.config.ts'],
    rules: {
      // Test and config files legitimately await nothing and type-assert more.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
