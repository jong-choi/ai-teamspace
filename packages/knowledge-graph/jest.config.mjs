import { createDefaultEsmPreset } from 'ts-jest';

const preset = createDefaultEsmPreset({ tsconfig: './tsconfig.json' });

export default {
  ...preset,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^#knowledge-graph/(.*)\\.js$': '<rootDir>/src/$1.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
