import { z } from 'zod';

export function urlWithProtocols(
  protocols: readonly string[],
  message: string,
) {
  return z
    .string()
    .min(1)
    .refine((value) => {
      try {
        return protocols.includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, message);
}

export const databaseUrlSchema = urlWithProtocols(
  ['postgres:', 'postgresql:'],
  'DATABASE_URL은 postgres:// 또는 postgresql:// 형식이어야 합니다.',
);

export const redisUrlSchema = urlWithProtocols(
  ['redis:', 'rediss:'],
  'Redis URL은 redis:// 또는 rediss:// 형식이어야 합니다.',
);

export const httpUrlSchema = urlWithProtocols(
  ['http:', 'https:'],
  'http 또는 https URL이어야 합니다.',
);

export const webSocketUrlSchema = urlWithProtocols(
  ['ws:', 'wss:'],
  'ws 또는 wss URL이어야 합니다.',
);

export const trustedOriginsSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.split(',').map((origin) => origin.trim()))
  .pipe(z.array(z.url()).min(1));
