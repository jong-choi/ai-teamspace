import eslint from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      // .gitignore의 작업 디렉터리. Prettier와 달리 ESLint flat config는 .gitignore를 읽지 않는다.
      '.temp/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.expo/**',
      '**/generated/**',
      '**/*.generated.*',
      'server/drizzle/**',
      'client/packages/rnr/src/components/ui/**',
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
            ['^@repo/', '^#server/', '^#server-source/', '^@core/', '^@/'],
            ['^@?\\w'],
            ['^'],
            ['^\\.'],
          ],
        },
      ],
    },
  },
  {
    files: ['server/**/*.{ts,tsx}', 'client/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/root-path': import.meta.dirname,
      'boundaries/dependency-nodes': [
        'import',
        'export',
        'dynamic-import',
        'require',
      ],
      'import/resolver': {
        typescript: {
          project: [
            `${import.meta.dirname}/server/tsconfig.json`,
            `${import.meta.dirname}/client/packages/*/tsconfig.json`,
            `${import.meta.dirname}/client/projects/*/apps/*/tsconfig.json`,
          ],
        },
      },
      // 세부 경계를 먼저 분류하고 feature 이름을 의존성 비교에 사용한다.
      'boundaries/elements': [
        {
          type: 'server-contract',
          pattern: 'server/src/config/config.type.ts',
          mode: 'full',
        },
        {
          type: 'server-contract',
          pattern: 'server/src/mcp/contracts/**',
          mode: 'full',
        },
        {
          type: 'server-contract',
          pattern:
            'server/src/agent/infrastructure/mcp/{workos-tool-session.provider,workos-mcp-auth-provider.factory}.ts',
          mode: 'full',
        },
        {
          type: 'server-composition',
          pattern:
            'server/src/agent-mcp-connections/infrastructure/mcp/combined-mcp-tool-session.{adapter,module}.ts',
          mode: 'full',
        },
        {
          type: 'server-composition',
          pattern:
            'server/src/agent/infrastructure/deep-agent/deep-agent.module.ts',
          mode: 'full',
        },
        {
          type: 'port',
          pattern:
            'server/src/mcp-access/infrastructure/audit/mcp-policy-audit.publisher.ts',
          mode: 'full',
          capture: ['feature'],
        },
        {
          type: 'auth-generated',
          pattern:
            'server/src/auth/infrastructure/persistence/drizzle/generated/**',
          mode: 'full',
        },
        {
          type: 'auth-persistence-reference',
          pattern:
            'server/src/auth/infrastructure/persistence/drizzle/auth-user-reference.ts',
          mode: 'full',
        },
        {
          type: 'auth-persistence-reference',
          pattern:
            'server/src/auth/infrastructure/persistence/drizzle/auth-organization-reference.ts',
          mode: 'full',
        },
        {
          type: 'schema-aggregator',
          pattern: 'server/src/database/schema.ts',
          mode: 'full',
        },
        {
          type: 'auth-composition',
          pattern: 'server/src/auth/auth.ts',
          mode: 'full',
        },
        {
          type: 'database-connection',
          pattern: 'server/src/database/database.service.ts',
          mode: 'full',
        },
        {
          type: 'server-test',
          pattern: 'server/src/**/*.spec.ts',
          mode: 'full',
        },
        {
          type: 'server-test',
          pattern: 'server/src/**/*.integration.ts',
          mode: 'full',
        },
        {
          type: 'server-test',
          pattern: 'server/src/*/testing/**',
          mode: 'full',
        },
        { type: 'server-test', pattern: 'server/test/**', mode: 'full' },
        {
          type: 'drizzle-config',
          pattern: 'server/drizzle.config.ts',
          mode: 'full',
        },
        {
          type: 'service',
          pattern: 'server/src/*/auth-user-directory.service.ts',
          mode: 'full',
          capture: ['feature'],
        },
        {
          type: 'port',
          pattern: 'server/src/*/infrastructure/user-directory/*.provider.ts',
          mode: 'full',
          capture: ['feature'],
        },
        {
          type: 'adapter',
          pattern:
            'server/src/*/infrastructure/persistence/drizzle/repositories/**',
          mode: 'full',
          capture: ['feature'],
        },
        {
          type: 'domain',
          pattern: 'server/src/*/domain/**',
          mode: 'full',
          capture: ['feature'],
        },
        {
          type: 'schema',
          pattern: 'server/src/*/infrastructure/persistence/drizzle/schema/**',
          mode: 'full',
          capture: ['feature'],
        },
        {
          type: 'server-infra',
          pattern: 'server/src/{auth,config,database,jobs,outbox,queue}/**',
          mode: 'full',
        },
        {
          type: 'service',
          pattern: 'server/src/*/*.service.ts',
          mode: 'full',
          capture: ['feature'],
        },
        { type: 'service', pattern: 'server/src/app.service.ts', mode: 'full' },
        {
          type: 'port',
          pattern: 'server/src/*/infrastructure/persistence/*.repository.ts',
          mode: 'full',
          capture: ['feature'],
        },
        {
          type: 'port',
          pattern: 'server/src/*/infrastructure/*/*.provider.ts',
          mode: 'full',
          capture: ['feature'],
        },
        {
          type: 'adapter',
          pattern: 'server/src/*/infrastructure/**',
          mode: 'full',
          capture: ['feature'],
        },
        {
          type: 'feature',
          pattern: 'server/src/*/**',
          mode: 'full',
          capture: ['feature'],
        },
        { type: 'server-entry', pattern: 'server/**', mode: 'full' },
        {
          type: 'product-core',
          pattern: 'client/projects/*/src/**',
          mode: 'full',
          capture: ['product'],
        },
        {
          type: 'renderer',
          pattern: 'client/projects/*/apps/*/**/renderer/**',
          mode: 'full',
        },
        {
          type: 'platform-app',
          pattern: 'client/projects/*/apps/**',
          mode: 'full',
        },
        { type: 'shared', pattern: 'client/packages/**', mode: 'full' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: [
                'service',
                'domain',
                'port',
                'schema',
                'adapter',
                'feature',
              ],
              disallow: [
                ['port', { feature: '!${from.feature}' }],
                ['schema', { feature: '!${from.feature}' }],
                ['adapter', { feature: '!${from.feature}' }],
              ],
            },
            {
              from: ['service'],
              disallow: [
                'adapter',
                'schema',
                'server-infra',
                'auth-composition',
                'auth-persistence-reference',
                'database-connection',
                'schema-aggregator',
              ],
            },
            {
              from: ['domain'],
              disallow: [
                'service',
                'feature',
                'port',
                'adapter',
                'server-infra',
                'auth-composition',
                'auth-persistence-reference',
                'database-connection',
                'schema-aggregator',
              ],
            },
            {
              from: ['port', 'feature'],
              disallow: ['auth-persistence-reference'],
            },
            {
              from: ['product-core', 'shared'],
              disallow: ['platform-app', 'renderer'],
            },
            { from: ['shared'], disallow: ['product-core'] },
            { from: ['*'], disallow: ['auth-generated', 'schema-aggregator'] },
            {
              from: [
                'auth-composition',
                'auth-persistence-reference',
                'schema-aggregator',
                'drizzle-config',
                'server-test',
                ['adapter', { feature: 'auth' }],
              ],
              allow: ['auth-generated'],
            },
            {
              from: ['database-connection', 'drizzle-config', 'server-test'],
              allow: ['schema-aggregator'],
            },
          ],
        },
      ],
      // 외부 패키지 제한도 dynamic import와 require까지 같은 규칙으로 검사한다.
      'boundaries/external': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: ['service'],
              disallow: [
                'drizzle-orm',
                'pg',
                'better-auth',
                '@better-auth/*',
                '@thallesp/nestjs-better-auth',
              ],
            },
            {
              from: ['domain'],
              disallow: [
                '@nestjs/*',
                'drizzle-orm',
                'pg',
                'better-auth',
                '@better-auth/*',
                '@thallesp/nestjs-better-auth',
                'bullmq',
                'ioredis',
              ],
            },
            {
              from: ['product-core', 'renderer'],
              disallow: [
                'electron',
                'node:*',
                'fs',
                'child_process',
                'worker_threads',
                'net',
                'tls',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.{spec,test}.{ts,tsx}',
      '**/*.integration.ts',
      '**/*.e2e-spec.ts',
      'server/src/*/testing/**/*.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.config*.{js,mjs,cjs,ts}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-restricted-imports': 'off',
    },
  },
);
