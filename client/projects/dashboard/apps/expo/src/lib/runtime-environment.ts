import { z } from 'zod';

const publicHttpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => value.startsWith('http://') || value.startsWith('https://'),
    'http 또는 https URL이어야 합니다.',
  )
  .transform((value) => value.replace(/\/+$/, ''));

const nativeRuntimeEnvironmentSchema = z.object({
  EXPO_PUBLIC_API_URL: publicHttpUrlSchema,
});

type NativeRuntimeEnvironmentInput = {
  EXPO_PUBLIC_API_URL: string | undefined;
};

export function parseNativeRuntimeEnvironment(
  input: NativeRuntimeEnvironmentInput,
) {
  return nativeRuntimeEnvironmentSchema.parse(input);
}
