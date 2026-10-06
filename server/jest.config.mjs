import { createDefaultPreset } from 'ts-jest';

const preset = createDefaultPreset({
  tsconfig: './tsconfig.jest.json',
  diagnostics: false,
});

export default {
  ...preset,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@repo/agent-runtime$': '<rootDir>/../packages/agent-runtime/src/index.ts',
    '^@repo/agent-runtime/(.*)$':
      '<rootDir>/../packages/agent-runtime/src/$1/index.ts',
    '^#agent-runtime/(.*)\\.js$':
      '<rootDir>/../packages/agent-runtime/src/$1.ts',
    '^#agent-runtime/(.*)$': '<rootDir>/../packages/agent-runtime/src/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
