import type { IncomingHttpHeaders } from 'node:http';

import { Injectable } from '@nestjs/common';

import type { Auth } from '@/auth/auth';
import { UserAccountProvider } from '@/user-profile/infrastructure/account/user-account.provider';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';

@Injectable()
export class BetterAuthUserAccountAdapter extends UserAccountProvider {
  constructor(private readonly authService: AuthService<Auth>) {
    super();
  }

  async updateImage(
    headers: IncomingHttpHeaders,
    image: string | null,
  ): Promise<void> {
    await this.authService.api.updateUser({
      body: { image },
      headers: fromNodeHeaders(headers),
    });
  }
}
