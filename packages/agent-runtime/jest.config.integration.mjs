import baseConfig from './jest.config.mjs';

export default {
  ...baseConfig,
  testMatch: ['<rootDir>/src/**/*.integration.ts'],
  maxWorkers: 1,
};
