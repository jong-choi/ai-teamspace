import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';

import { configureApiRuntime } from '@repo/client/api-client/runtime';
import { parseNativeRuntimeEnvironment } from '@/lib/runtime-environment';

import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';

const native = Platform.OS !== 'web';
const nativeApiBaseUrl = native
  ? parseNativeRuntimeEnvironment({
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    }).EXPO_PUBLIC_API_URL
  : undefined;

export const authClient = createAuthClient({
  ...(nativeApiBaseUrl ? { baseURL: nativeApiBaseUrl } : {}),
  plugins: [
    expoClient({
      scheme: 'monorepoerp',
      storagePrefix: 'monorepoerp',
      storage: SecureStore,
    }),
  ],
});

configureApiRuntime({
  baseUrl: nativeApiBaseUrl,
  credentials: native ? 'omit' : 'include',
  expoOrigin: native ? 'monorepoerp://' : undefined,
  fetcher: native ? (input, init) => expoFetch(input, init) : undefined,
  getCookie: native ? () => authClient.getCookie() : undefined,
});
