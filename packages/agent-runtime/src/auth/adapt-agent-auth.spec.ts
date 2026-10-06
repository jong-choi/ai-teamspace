import { Auth, HTTPException } from '@langchain/langgraph-sdk/auth';

import { adaptAgentAuth } from '#agent-runtime/auth/adapt-agent-auth.js';

describe('Agent Auth 어댑터', () => {
  test('stock Auth principal과 ownership filter를 Skein contract로 변환한다', async () => {
    const auth = new Auth()
      .authenticate(() => ({
        identity: 'user-1',
        display_name: '사용자 1',
        permissions: ['threads:read'],
      }))
      .on('threads', ({ user }) => ({ owner_user_id: user.identity }));

    const engine = adaptAgentAuth(auth);
    const context = await engine.authenticate(
      new Request('http://localhost/threads'),
    );
    expect(context?.user).toMatchObject({
      identity: 'user-1',
      display_name: '사용자 1',
      permissions: ['threads:read'],
      is_authenticated: true,
    });

    const authorization = await engine.authorize({
      resource: 'threads',
      action: 'read',
      value: {},
      context,
    });
    expect(authorization.filters).toEqual({ owner_user_id: 'user-1' });
    expect(
      engine.matchesFilters({ owner_user_id: 'user-1' }, authorization.filters),
    ).toBe(true);
    expect(
      engine.matchesFilters({ owner_user_id: 'user-2' }, authorization.filters),
    ).toBe(false);
  });

  test('$contains filter가 LangGraph API와 같은 top-level containment 의미를 가진다', () => {
    const engine = adaptAgentAuth(new Auth().authenticate(() => 'user-1'));

    expect(
      engine.matchesFilters(
        { organization_ids: ['org-1', 'org-2'] },
        { organization_ids: { $contains: 'org-2' } },
      ),
    ).toBe(true);
    expect(
      engine.matchesFilters(
        { organization_ids: ['org-1'] },
        { organization_ids: { $contains: 'org-2' } },
      ),
    ).toBe(false);
  });

  test('falsy operator operand는 LangGraph isAuthMatching과 동일하게 constraint를 만들지 않는다', () => {
    const engine = adaptAgentAuth(new Auth().authenticate(() => 'user-1'));

    expect(
      engine.matchesFilters({ owner: 'alice' }, { owner: { $eq: '' } }),
    ).toBe(true);
    expect(
      engine.matchesFilters(
        { tags: 'not-an-array' },
        { tags: { $contains: '' } },
      ),
    ).toBe(true);
    expect(engine.matchesFilters(undefined, { owner: {} })).toBe(true);
    expect(engine.matchesFilters({ owner: 'alice' }, { owner: '' })).toBe(
      false,
    );
  });

  test('stock HTTPException을 Skein HTTP 오류로 보존한다', async () => {
    const engine = adaptAgentAuth(
      new Auth().authenticate(() => {
        throw new HTTPException(401, { message: '인증 실패' });
      }),
    );

    await expect(
      engine.authenticate(new Request('http://localhost/threads')),
    ).rejects.toMatchObject({ status: 401 });
  });
});
