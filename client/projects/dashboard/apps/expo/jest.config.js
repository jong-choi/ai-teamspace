const lucideReactNative = require.resolve('lucide-react-native');

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  roots: ['<rootDir>/src', '<rootDir>/../../src'],
  moduleNameMapper: {
    '^lucide-react-native$': lucideReactNative,
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@core/(.*)$': '<rootDir>/../../src/$1',
    '^@repo/client/api-client$':
      '<rootDir>/../../../../packages/api-client/src/generated/work-os.ts',
    '^@repo/client/api-client/runtime$':
      '<rootDir>/../../../../packages/api-client/src/runtime.ts',
    '^@repo/client/api-client/schemas$':
      '<rootDir>/../../../../packages/api-client/src/generated/schemas/index.ts',
    '^@repo/client/api-client/sse$':
      '<rootDir>/../../../../packages/api-client/src/sse.ts',
    '^@repo/client/rnr/(.*)$': '<rootDir>/../../../../packages/rnr/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-router|@rn-primitives/.*|nativewind|react-native-css-interop|react-native-svg))',
  ],
};
