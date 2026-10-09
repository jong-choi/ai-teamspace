import { z } from 'zod';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isHttpsOrLoopbackHttp(url: URL): boolean {
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname))
  );
}

export const ollamaOriginUrlSchema = z
  .url()
  .transform((value) => new URL(value))
  .superRefine((url, context) => {
    if (!isHttpsOrLoopbackHttp(url))
      context.addIssue({
        code: 'custom',
        message:
          'OLLAMA_BASE_URL은 HTTPS여야 하며 로컬 개발에서는 loopback HTTP만 허용됩니다.',
      });
    if (url.username || url.password || url.search || url.hash)
      context.addIssue({
        code: 'custom',
        message:
          'OLLAMA_BASE_URL에는 credential, query 또는 fragment를 포함할 수 없습니다.',
      });
    if (url.pathname !== '/' && url.pathname !== '')
      context.addIssue({
        code: 'custom',
        message: 'OLLAMA_BASE_URL은 origin URL이어야 합니다.',
      });
  })
  .transform((url) => url.origin);

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
