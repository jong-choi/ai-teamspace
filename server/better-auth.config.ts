import 'dotenv/config';

import { createAuthOptions } from '@/auth/auth-options';
import { createMcpConfig } from '@/mcp/config/mcp.config';

import { betterAuth } from 'better-auth';

const baseUrl = process.env.BETTER_AUTH_URL;
if (!baseUrl) {
  throw new Error('BETTER_AUTH_URL 환경 변수가 필요합니다.');
}

export const auth = betterAuth({
  ...createAuthOptions(createMcpConfig()),
  baseURL: baseUrl,
});
