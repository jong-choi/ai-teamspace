import eslint from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.expo/**',
      '**/generated/**',
      '**/*.generated.*',
      'server/drizzle/**',
      'client/packages/ui-kit/src/components/ui/**',
      '**/nativewind-env.d.ts',
      '**/expo-env.d.ts',
      'eslint.config.mjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.es2025,
        ...globals.node,
      },
      sourceType: 'module',
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['./*', '../*'],
              message: '가능한 소스 import는 alias 기반 절대경로를 사용한다.',
            },
          ],
        },
      ],
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            ['^\\u0000'],
            ['^node:'],
            [
              '^react$',
              '^react',
              '^react-native',
              '^expo',
              '^@expo',
              '^@nestjs',
            ],
            [
              '^@monorepo-erp/',
              '^#server/',
              '^#server-source/',
              '^@core/',
              '^@ui-kit/',
              '^@/',
            ],
            ['^@?\\w'],
            ['^'],
            ['^\\.'],
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{spec,test}.{ts,tsx}', '**/*.e2e-spec.ts'],
    ...vitest.configs.recommended,
    languageOptions: {
      globals: {
        ...vitest.environments.env.globals,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/expect-expect': 'off',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  {
    files: ['**/*.config.{js,mjs,cjs,ts}', '**/scripts/**/*.{js,mjs,cjs,ts}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
