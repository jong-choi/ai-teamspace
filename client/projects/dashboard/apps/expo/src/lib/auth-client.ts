import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';

import { configureApiRuntime } from '@repo/client/api-client/runtime';

import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';

const native = Platform.OS !== 'web';
const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiBaseUrl) {
  throw new Error('EXPO_PUBLIC_API_URL이 필요합니다.');
}

export const authClient = createAuthClient({
  baseURL: apiBaseUrl,
  plugins: [
    expoClient({
      scheme: 'monorepoerp',
      storagePrefix: 'monorepoerp',
      storage: SecureStore,
    }),
  ],
});

configureApiRuntime({
  baseUrl: apiBaseUrl,
  credentials: native ? 'omit' : 'include',
  expoOrigin: native ? 'monorepoerp://' : undefined,
  fetcher: native ? (input, init) => expoFetch(input, init) : undefined,
  getCookie: native ? () => authClient.getCookie() : undefined,
});
