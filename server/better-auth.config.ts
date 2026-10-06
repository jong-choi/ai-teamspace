import { authOptions } from '@/auth/auth-options';

import { betterAuth } from 'better-auth';

export const auth = betterAuth({
  ...authOptions,
  // CLI schema 생성에는 요청 origin이 없으므로 고정된 로컬 URL을 사용한다.
  baseURL: 'http://localhost:3000',
});
