import { createDefaultPreset } from 'ts-jest';

const preset = createDefaultPreset({
  tsconfig: './tsconfig.jest.json',
});

export default {
  ...preset,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@monorepo-erp/api-client$': '<rootDir>/src/generated/work-os.ts',
    '^@monorepo-erp/api-client/(.*)$': '<rootDir>/src/$1.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
