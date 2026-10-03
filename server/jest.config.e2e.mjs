import baseConfig from './jest.config.mjs';

export default {
  ...baseConfig,
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
};
