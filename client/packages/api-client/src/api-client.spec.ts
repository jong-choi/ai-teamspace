import {
  organizationsControllerCreate,
  organizationsControllerGetActive,
  organizationsControllerRemoveMember,
} from '@repo/client/api-client';

import { jest } from '@jest/globals';
import { ZodError } from 'zod';

afterEach(() => jest.restoreAllMocks());

describe('생성된 조직 API 계약', () => {
  it('활성 조직의 null 응답과 쿠키 전달을 보존한다', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ activeOrganization: null }));
    const result = await organizationsControllerGetActive();
    expect(result.activeOrganization).toBeNull();
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
      errorCode: 'ORGANIZATION_SLUG_CONFLICT',
    };
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(problem, { status: 409 }));
    await expect(
      organizationsControllerCreate({ name: '조직', slug: 'existing' }),
    ).rejects.toEqual(problem);
  });

  it('생성된 Zod 계약과 다른 성공 응답은 거절한다', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ activeOrganization: {} }));

    await expect(organizationsControllerGetActive()).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it('삭제의 204 응답은 JSON 본문 없이 처리한다', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const result = await organizationsControllerRemoveMember(
      'organization',
      'member',
    );
    expect(result).toBeUndefined();
  });
});
