import baseConfig from './jest.config.mjs';

export default {
  ...baseConfig,
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  maxWorkers: 1,
  setupFilesAfterEnv: [
    '<rootDir>/src/testing/close-on-compile-failure.setup.ts',
    '<rootDir>/src/knowledge-graph/testing/knowledge-graph-test-database.setup.ts',
  ],
};
