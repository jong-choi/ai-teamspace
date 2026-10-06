import { createDefaultPreset } from 'ts-jest';

const preset = createDefaultPreset({
  tsconfig: './tsconfig.json',
  diagnostics: false,
});

export default {
  ...preset,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@repo/agent-runtime/(.*)$': '<rootDir>/src/$1/index.ts',
    '^#agent-runtime/(.*)\\.js$': '<rootDir>/src/$1.ts',
    '^#agent-runtime/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
