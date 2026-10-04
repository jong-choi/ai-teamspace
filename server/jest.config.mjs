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
    '^#server/(.*)\\.js$': '<rootDir>/src/$1.ts',
    '^#server/(.*)$': '<rootDir>/src/$1',
    '^#server-source/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
