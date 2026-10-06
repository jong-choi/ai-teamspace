import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import { WikiCollaborationInvalidTokenError } from '@/wiki/domain/wiki.error';
import type { CollaborationConfig } from '@/wiki/infrastructure/collaboration/config/collaboration-config.type';
import { JoseWikiCollaborationTokenAdapter } from '@/wiki/infrastructure/collaboration/jose/jose-wiki-collaboration-token.adapter';
import { WIKI_COLLABORATION_TOKEN_TYPE } from '@/wiki/infrastructure/collaboration/wiki-collaboration-token.provider';

import { decodeJwt } from 'jose';

const organizationId = 'organization-a';
const documentId = '11111111-1111-4111-8111-111111111111';
const userId = 'user-a';
const tokenId = '22222222-2222-4222-8222-222222222222';
const collaborationConfig: CollaborationConfig = {
  port: 3002,
  publicUrl: 'ws://localhost:3002',
  jwtSecret: 'test-collaboration-secret-that-is-at-least-32-characters-long',
  redisUrl: 'redis://localhost:6382',
};
const configService = new ConfigService<AllConfigType>({
  collaboration: collaborationConfig,
});

describe('위키 공동편집 JWT adapter', () => {
  it('JWT claim은 sub, type, orgId, docId, jti 계약을 사용한다', async () => {
    const adapter = new JoseWikiCollaborationTokenAdapter(configService);
    const issued = await adapter.issue({
      userId,
      organizationId,
      documentId,
      tokenId,
    });

    expect(decodeJwt(issued.token)).toMatchObject({
      sub: userId,
      type: WIKI_COLLABORATION_TOKEN_TYPE,
      orgId: organizationId,
      docId: documentId,
      jti: tokenId,
    });
    await expect(adapter.verify(issued.token)).resolves.toEqual({
      userId,
      organizationId,
      documentId,
      tokenId,
      expiresAt: issued.expiresAt,
    });
  });

  it('유효하지 않은 token은 collaboration 전용 오류로 변환한다', async () => {
    const adapter = new JoseWikiCollaborationTokenAdapter(configService);

    await expect(adapter.verify('invalid-token')).rejects.toBeInstanceOf(
      WikiCollaborationInvalidTokenError,
    );
  });
});
