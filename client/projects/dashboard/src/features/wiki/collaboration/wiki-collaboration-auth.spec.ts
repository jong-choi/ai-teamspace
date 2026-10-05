import {
  classifyWikiCollaborationAuthenticationFailure,
  isWikiCollaborationSessionAccessDenied,
} from '@core/features/wiki/collaboration/wiki-collaboration-auth';

import { describe, expect, it } from '@jest/globals';

describe('위키 공동편집 인증 분기', () => {
  it('프로토콜 불일치는 앱 업데이트 필요 상태로 분기한다', () => {
    expect(
      classifyWikiCollaborationAuthenticationFailure(
        'WIKI_COLLABORATION_PROTOCOL_VERSION_UNSUPPORTED',
      ),
    ).toBe('update-required');
  });

  it('권한 제거와 문서 삭제는 접근 거부 상태로 분기한다', () => {
    expect(
      classifyWikiCollaborationAuthenticationFailure(
        'WIKI_COLLABORATION_ACCESS_DENIED',
      ),
    ).toBe('access-denied');
    expect(
      classifyWikiCollaborationAuthenticationFailure('WIKI_DOCUMENT_NOT_FOUND'),
    ).toBe('access-denied');
  });

  it('토큰 관련 일반 인증 실패는 session 재발급을 시도한다', () => {
    expect(
      classifyWikiCollaborationAuthenticationFailure(
        'WIKI_COLLABORATION_INVALID_TOKEN',
      ),
    ).toBe('refresh-token');
    expect(
      classifyWikiCollaborationAuthenticationFailure('permission-denied'),
    ).toBe('refresh-token');
  });

  it('REST session 403과 404를 접근 불가로 판정한다', () => {
    expect(
      isWikiCollaborationSessionAccessDenied({
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
        errorCode: 'ORGANIZATION_ACCESS_DENIED',
      }),
    ).toBe(true);
    expect(
      isWikiCollaborationSessionAccessDenied({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        errorCode: 'WIKI_DOCUMENT_NOT_FOUND',
      }),
    ).toBe(true);
    expect(
      isWikiCollaborationSessionAccessDenied({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
      }),
    ).toBe(false);
  });
});
