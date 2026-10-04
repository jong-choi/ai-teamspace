import { createDefaultPreset } from 'ts-jest';

const preset = createDefaultPreset({
  tsconfig: './tsconfig.jest.json',
});

export default {
  ...preset,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@repo/client/api-client$': '<rootDir>/src/generated/work-os.ts',
    '^@repo/client/api-client/schemas$':
      '<rootDir>/src/generated/schemas/index.ts',
    '^@repo/client/api-client/(.*)$': '<rootDir>/src/$1.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
