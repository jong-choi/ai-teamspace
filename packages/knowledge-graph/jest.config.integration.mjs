import base from './jest.config.mjs';

export default {
  ...base,
  testMatch: ['<rootDir>/test/**/*.integration.ts'],
};
