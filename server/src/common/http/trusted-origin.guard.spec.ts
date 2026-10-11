import { type ExecutionContext, ForbiddenException } from '@nestjs/common';

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';

import { jest } from '@jest/globals';
import type { AuthService } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';

describe('신뢰 출처 가드', () => {
  it('쿠키 인증 네이티브 변경 요청의 신뢰된 expo-origin을 허용한다', async () => {
    const isTrustedOrigin = jest.fn(() => true);
    const guard = createGuard(isTrustedOrigin);
    const context = createContext({
      method: 'POST',
      cookie: 'better-auth.session_token=test',
      headers: { 'expo-origin': 'aiteamspace://' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(isTrustedOrigin).toHaveBeenCalledWith('aiteamspace://', {
      allowRelativePaths: false,
    });
  });

  it('쿠키 인증 네이티브 변경 요청의 신뢰되지 않은 expo-origin을 거절한다', async () => {
    const isTrustedOrigin = jest.fn(() => false);
    const guard = createGuard(isTrustedOrigin);
    const context = createContext({
      method: 'PATCH',
      cookie: 'better-auth.session_token=test',
      headers: { 'expo-origin': 'untrusted://' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('표준 Origin이 있으면 expo-origin보다 우선한다', async () => {
    const isTrustedOrigin = jest.fn(
      (origin: string) => origin === 'https://trusted.example',
    );
    const guard = createGuard(isTrustedOrigin);
    const context = createContext({
      method: 'POST',
      cookie: 'better-auth.session_token=test',
      headers: {
        origin: 'https://trusted.example',
        'expo-origin': 'untrusted://',
      },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(isTrustedOrigin).toHaveBeenCalledWith('https://trusted.example', {
      allowRelativePaths: false,
    });
  });
});

function createGuard(
  isTrustedOrigin: (
    origin: string,
    options: { allowRelativePaths: boolean },
  ) => boolean,
): TrustedOriginGuard {
  const auth = {
    instance: {
      $context: Promise.resolve({ isTrustedOrigin }),
    },
  } as unknown as AuthService<Auth>;
  return new TrustedOriginGuard(auth);
}

function createContext(input: {
  method: string;
  cookie?: string;
  headers: Record<string, string>;
}): ExecutionContext {
  const request = {
    method: input.method,
    headers: input.cookie ? { cookie: input.cookie } : {},
    get(name: string) {
      return input.headers[name.toLowerCase()];
    },
  } as unknown as Request;

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}
