import { adaptAgentAuth } from '@repo/agent-runtime';
import { AgentAuthorizationPolicy } from '#server/agent/application/agent-authorization.policy.js';
import { AgentIdentityProvider } from '#server/agent/infrastructure/auth/agent-identity.provider.js';

class StubAgentIdentityProvider extends AgentIdentityProvider {
  actor: Awaited<ReturnType<AgentIdentityProvider['resolve']>> = {
    userId: 'user.name*id',
    displayName: '사용자',
    permissions: [],
  };

  resolve(): Promise<Awaited<ReturnType<AgentIdentityProvider['resolve']>>> {
    return Promise.resolve(this.actor);
  }
}

describe('Agent 권한 정책', () => {
  test('identity를 principal과 ownership 정책으로 변환한다', async () => {
    const identities = new StubAgentIdentityProvider();
    const engine = adaptAgentAuth(
      new AgentAuthorizationPolicy(identities).create(),
    );
    const context = await engine.authenticate(
      new Request('http://localhost/threads'),
    );

    expect(context?.user).toMatchObject({
      identity: 'user.name*id',
      display_name: '사용자',
      permissions: [],
      is_authenticated: true,
    });

    const threadAuthorization = await engine.authorize({
      resource: 'threads',
      action: 'create',
      value: { metadata: {} },
      context,
    });
    expect(threadAuthorization.filters).toEqual({
      owner_user_id: 'user.name*id',
    });

    const storeAuthorization = await engine.authorize({
      resource: 'store',
      action: 'get',
      value: { namespace: ['memory', 'notes'], key: 'private-note' },
      context,
    });
    expect(storeAuthorization.value).toMatchObject({
      namespace: ['user%2Ename%2Aid', 'notes'],
    });

    await expect(
      engine.authorize({
        resource: 'assistants',
        action: 'create',
        value: { assistant_id: 'forged' },
        context,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  test('identity가 없으면 인증을 거부한다', async () => {
    const identities = new StubAgentIdentityProvider();
    identities.actor = null;
    const engine = adaptAgentAuth(
      new AgentAuthorizationPolicy(identities).create(),
    );

    await expect(
      engine.authenticate(new Request('http://localhost/threads')),
    ).rejects.toMatchObject({ status: 401 });
  });
});
