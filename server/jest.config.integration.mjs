import baseConfig from './jest.config.mjs';

export default {
  ...baseConfig,
  testMatch: ['<rootDir>/src/**/*.integration.ts'],
  maxWorkers: 1,
  setupFilesAfterEnv: [
    '<rootDir>/src/testing/close-on-compile-failure.setup.ts',
    '<rootDir>/src/knowledge-graph/testing/knowledge-graph-test-database.setup.ts',
  ],
};
