import 'dotenv/config';

import { authOptions } from '@/auth/auth-options';

import { betterAuth } from 'better-auth';

const baseUrl = process.env.BETTER_AUTH_URL;
if (!baseUrl) {
  throw new Error('BETTER_AUTH_URL 환경 변수가 필요합니다.');
}

export const auth = betterAuth({
  ...authOptions,
  baseURL: baseUrl,
});
