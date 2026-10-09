import { KnowledgeGraphAuthorizationUnavailableError } from '@/knowledge-graph/domain/graph-query.error';
import { WorkosGraphSourceAccessAdapter } from '@/knowledge-graph/infrastructure/source-access/workos/workos-graph-source-access.adapter';
import {
  OrganizationNotFoundError,
  OrganizationProviderFailureError,
} from '@/organizations/domain/organization.error';

describe('WorkosGraphSourceAccessAdapter', () => {
  const actor = { userId: 'user-a' };
  const organizations = {
    getDetail: jest.fn(),
  };
  const membership = {
    lockRole: jest.fn(),
  };
  const wiki = {
    lockDocumentVersion: jest.fn(),
  };

  const adapter = new WorkosGraphSourceAccessAdapter(
    organizations as never,
    membership as never,
    wiki as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('읽기 권한 확인은 현재 조직 owner 서비스에 그대로 위임한다', async () => {
    organizations.getDetail.mockResolvedValue({ role: 'member' });

    await expect(
      adapter.assertReadable(actor, 'org-a'),
    ).resolves.toBeUndefined();

    expect(organizations.getDetail).toHaveBeenCalledWith(actor, 'org-a');
  });

  it('비회원·없는 조직의 not_found 오류는 숨김 정책을 유지한다', async () => {
    const error = new OrganizationNotFoundError();
    organizations.getDetail.mockRejectedValue(error);

    await expect(adapter.assertReadable(actor, 'org-a')).rejects.toBe(error);
  });

  it('조직 provider 장애와 예기치 않은 장애는 KG_AUTHORIZATION_UNAVAILABLE로 fail-closed한다', async () => {
    organizations.getDetail
      .mockRejectedValueOnce(new OrganizationProviderFailureError())
      .mockRejectedValueOnce(new Error('db down'));

    await expect(adapter.assertReadable(actor, 'org-a')).rejects.toMatchObject({
      code: 'KG_AUTHORIZATION_UNAVAILABLE',
      kind: 'unavailable',
    });
    await expect(adapter.assertReadable(actor, 'org-a')).rejects.toBeInstanceOf(
      KnowledgeGraphAuthorizationUnavailableError,
    );
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
  ] as const)(
    '관리자 판정은 현재 role %s를 사용한다',
    async (role, expected) => {
      organizations.getDetail.mockResolvedValue({ role });

      await expect(adapter.isAdministrator(actor, 'org-a')).resolves.toBe(
        expected,
      );
    },
  );

  it('문서 잠금은 회원을 먼저 잠그고 같은 조직 문서 version을 잠근다', async () => {
    const updatedAt = new Date('2026-10-09T00:00:00Z');
    membership.lockRole.mockResolvedValue('member');
    wiki.lockDocumentVersion.mockResolvedValue({ updatedAt });

    await expect(
      adapter.lockWikiWriter('org-a', 'user-a', 'doc-a'),
    ).resolves.toEqual({ updatedAt });

    expect(membership.lockRole).toHaveBeenCalledWith('org-a', 'user-a');
    expect(wiki.lockDocumentVersion).toHaveBeenCalledWith('org-a', 'doc-a');
  });

  it('문서 잠금은 탈퇴 사용자를 not_member, 없는 문서를 not_found로 구분한다', async () => {
    membership.lockRole
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('member');
    wiki.lockDocumentVersion.mockResolvedValueOnce(null);

    await expect(
      adapter.lockWikiWriter('org-a', 'user-a', 'doc-a'),
    ).resolves.toBe('not_member');
    expect(wiki.lockDocumentVersion).not.toHaveBeenCalled();

    await expect(
      adapter.lockWikiWriter('org-a', 'user-a', 'doc-a'),
    ).resolves.toBe('not_found');
  });

  it('잠금 경계의 DB 장애도 권한 확인 불가로 변환한다', async () => {
    membership.lockRole.mockRejectedValue(new Error('db down'));

    await expect(
      adapter.lockWikiWriter('org-a', 'user-a', 'doc-a'),
    ).rejects.toMatchObject({ code: 'KG_AUTHORIZATION_UNAVAILABLE' });
    await expect(
      adapter.lockAdministrator('org-a', 'user-a'),
    ).rejects.toMatchObject({ code: 'KG_AUTHORIZATION_UNAVAILABLE' });
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    [null, false],
  ] as const)(
    '관리자 잠금은 잠근 role %s만 판정한다',
    async (role, expected) => {
      membership.lockRole.mockResolvedValue(role);

      await expect(adapter.lockAdministrator('org-a', 'user-a')).resolves.toBe(
        expected,
      );
    },
  );
});
