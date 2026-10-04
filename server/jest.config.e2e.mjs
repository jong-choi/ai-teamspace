import baseConfig from './jest.config.mjs';

export default {
  ...baseConfig,
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  maxWorkers: 1,
  setupFiles: ['<rootDir>/jest.setup.ts'],
};
