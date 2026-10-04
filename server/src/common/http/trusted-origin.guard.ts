import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { Auth } from '#server/auth/auth.js';

import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  constructor(private readonly auth: AuthService<Auth>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ||
      !request.headers.cookie
    ) {
      return true;
    }

    const origin =
      request.get('origin') ??
      request.get('referer') ??
      request.get('expo-origin');
    const authContext = await this.auth.instance.$context;
    if (
      !origin ||
      origin === 'null' ||
      !authContext.isTrustedOrigin(origin, { allowRelativePaths: false })
    ) {
      throw new ForbiddenException('신뢰할 수 없는 요청 출처입니다.');
    }
    return true;
  }
}
