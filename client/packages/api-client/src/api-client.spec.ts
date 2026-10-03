import {
  organizationsControllerCreate,
  organizationsControllerGetActive,
  organizationsControllerRemoveMember,
} from '@monorepo-erp/api-client';

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

describe('생성된 조직 API 계약', () => {
  it('활성 조직의 null 응답과 쿠키 전달을 보존한다', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ activeOrganization: null }));
    vi.stubGlobal('fetch', fetch);
    const result = await organizationsControllerGetActive();
    expect(result.data.activeOrganization).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      '/organizations/active',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('RFC 9457 오류를 성공 데이터로 반환하지 않고 거절한다', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      code: 'ORGANIZATION_SLUG_CONFLICT',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(problem, { status: 409 })),
    );
    await expect(
      organizationsControllerCreate({ name: '조직', slug: 'existing' }),
    ).rejects.toMatchObject({ status: 409, info: problem });
  });

  it('삭제의 204 응답은 JSON 본문 없이 처리한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    const result = await organizationsControllerRemoveMember(
      'organization',
      'member',
    );
    expect(result.status).toBe(204);
  });
});
