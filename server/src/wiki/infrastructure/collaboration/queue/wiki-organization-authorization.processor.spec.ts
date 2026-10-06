import { ORGANIZATION_AUTHORIZATION_CHANGED_JOB } from '@/organizations/domain/organization-public-event';
import { toWikiCollaborationInvalidationEvent } from '@/wiki/infrastructure/collaboration/queue/wiki-organization-authorization.processor';

import { ZodError } from 'zod';

describe('위키 조직 권한 invalidation 변환', () => {
  it('조직 권한 변경 event를 organization-user invalidation으로 변환한다', () => {
    expect(
      toWikiCollaborationInvalidationEvent(
        ORGANIZATION_AUTHORIZATION_CHANGED_JOB,
        {
          organizationId: 'organization-a',
          userId: 'user-a',
          reason: 'member-role-changed',
        },
      ),
    ).toEqual({
      scope: 'organization-user',
      organizationId: 'organization-a',
      userId: 'user-a',
    });
  });

  it('지원하지 않는 organization public event는 거부한다', () => {
    expect(() =>
      toWikiCollaborationInvalidationEvent('other-event', {}),
    ).toThrow('지원하지 않는 organization public event입니다');
  });

  it('잘못된 organization 권한 변경 payload는 거부한다', () => {
    expect(() =>
      toWikiCollaborationInvalidationEvent(
        ORGANIZATION_AUTHORIZATION_CHANGED_JOB,
        {
          organizationId: '',
          userId: 'user-a',
          reason: 'member-role-changed',
        },
      ),
    ).toThrow(ZodError);
  });
});
