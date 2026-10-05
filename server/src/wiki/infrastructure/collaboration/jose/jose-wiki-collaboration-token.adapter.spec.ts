import { WikiCollaborationInvalidTokenError } from '#server/wiki/domain/wiki.error.js';
import { JoseWikiCollaborationTokenAdapter } from '#server/wiki/infrastructure/collaboration/jose/jose-wiki-collaboration-token.adapter.js';
import type { WikiCollaborationEnvironment } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-configuration.provider.js';
import { WIKI_COLLABORATION_TOKEN_TYPE } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-token.provider.js';

import { decodeJwt } from 'jose';

const organizationId = 'organization-a';
const documentId = '11111111-1111-4111-8111-111111111111';
const userId = 'user-a';
const tokenId = '22222222-2222-4222-8222-222222222222';
const collaborationEnvironment: WikiCollaborationEnvironment = {
  COLLABORATION_PORT: 3002,
  COLLABORATION_PUBLIC_URL: 'ws://localhost:3002',
  COLLABORATION_JWT_SECRET:
    'test-collaboration-secret-that-is-at-least-32-characters-long',
  REDIS_COLLABORATION_URL: 'redis://localhost:6382',
};

describe('위키 공동편집 JWT adapter', () => {
  it('JWT claim은 sub, type, orgId, docId, jti 계약을 사용한다', async () => {
    const adapter = new JoseWikiCollaborationTokenAdapter(
      collaborationEnvironment,
    );
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
    const adapter = new JoseWikiCollaborationTokenAdapter(
      collaborationEnvironment,
    );

    await expect(adapter.verify('invalid-token')).rejects.toBeInstanceOf(
      WikiCollaborationInvalidTokenError,
    );
  });
});
