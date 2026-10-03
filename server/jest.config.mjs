import { createDefaultEsmPreset } from 'ts-jest';

const preset = createDefaultEsmPreset({
  tsconfig: './tsconfig.jest.json',
});

export default {
  ...preset,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transformIgnorePatterns: ['node_modules/(?!@camcima/nestjs-rfc9457/)'],
  moduleNameMapper: {
    '^@camcima/nestjs-rfc9457$':
      '<rootDir>/../node_modules/@camcima/nestjs-rfc9457/src/index.ts',
    '^@camcima/nestjs-rfc9457/swagger$':
      '<rootDir>/../node_modules/@camcima/nestjs-rfc9457/src/swagger/index.ts',
    '^#server/(.*)\\.js$': '<rootDir>/src/$1.ts',
    '^#server/(.*)$': '<rootDir>/src/$1',
    '^#server-source/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
