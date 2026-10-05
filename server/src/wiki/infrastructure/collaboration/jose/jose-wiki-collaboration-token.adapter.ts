import { Inject, Injectable } from '@nestjs/common';

import { WikiCollaborationInvalidTokenError } from '#server/wiki/domain/wiki.error.js';
import {
  WIKI_COLLABORATION_ENVIRONMENT,
  type WikiCollaborationEnvironment,
} from '#server/wiki/infrastructure/collaboration/wiki-collaboration-configuration.provider.js';
import {
  WIKI_COLLABORATION_TOKEN_TYPE,
  type WikiCollaborationTokenClaims,
  WikiCollaborationTokenProvider,
  type WikiCollaborationVerifiedToken,
} from '#server/wiki/infrastructure/collaboration/wiki-collaboration-token.provider.js';

import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

const tokenLifetimeSeconds = 5 * 60;
const tokenIssuer = 'work-os-wiki-collaboration';
const tokenAudience = 'work-os-wiki-collaboration';
const tokenPayloadSchema = z.object({
  sub: z.string().min(1),
  type: z.literal(WIKI_COLLABORATION_TOKEN_TYPE),
  orgId: z.string().min(1),
  docId: z.string().uuid(),
  jti: z.string().uuid(),
  exp: z.number().int().positive(),
});

@Injectable()
export class JoseWikiCollaborationTokenAdapter extends WikiCollaborationTokenProvider {
  private readonly secret: Uint8Array;

  constructor(
    @Inject(WIKI_COLLABORATION_ENVIRONMENT)
    environment: WikiCollaborationEnvironment,
  ) {
    super();
    this.secret = new TextEncoder().encode(
      environment.COLLABORATION_JWT_SECRET,
    );
  }

  async issue(
    claims: WikiCollaborationTokenClaims,
  ): Promise<{ token: string; expiresAt: Date }> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = nowSeconds + tokenLifetimeSeconds;
    const token = await new SignJWT({
      type: WIKI_COLLABORATION_TOKEN_TYPE,
      orgId: claims.organizationId,
      docId: claims.documentId,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(tokenIssuer)
      .setAudience(tokenAudience)
      .setSubject(claims.userId)
      .setJti(claims.tokenId)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(expiresAtSeconds)
      .sign(this.secret);

    return {
      token,
      expiresAt: new Date(expiresAtSeconds * 1000),
    };
  }

  async verify(token: string): Promise<WikiCollaborationVerifiedToken> {
    try {
      const result = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: tokenIssuer,
        audience: tokenAudience,
      });
      const payload = tokenPayloadSchema.parse(result.payload);
      return {
        userId: payload.sub,
        organizationId: payload.orgId,
        documentId: payload.docId,
        tokenId: payload.jti,
        expiresAt: new Date(payload.exp * 1_000),
      };
    } catch (error) {
      throw new WikiCollaborationInvalidTokenError({ cause: error });
    }
  }
}
