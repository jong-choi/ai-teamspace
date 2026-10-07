import { resolveAgentActor } from '@/agent/infrastructure/runtime/agent-actor.mapper';

describe('Agent actor mapper', () => {
  test('server-owned principal을 사용자와 조직 actor로 변환한다', () => {
    expect(
      resolveAgentActor({
        langgraph_auth_user_id: 'user-a',
        langgraph_auth_user: {
          organization_id: 'organization-a',
          display_name: '사용자 A',
        },
        langgraph_auth_permissions: ['agent:read', 123, 'agent:write'],
      }),
    ).toEqual({
      userId: 'user-a',
      organizationId: 'organization-a',
      displayName: '사용자 A',
      permissions: ['agent:read', 'agent:write'],
    });
  });

  test('인증 principal이 없으면 변환을 거부한다', () => {
    expect(() =>
      resolveAgentActor({
        langgraph_auth_user_id: 'user-a',
      }),
    ).toThrow('인증된 Agent actor principal이 없습니다.');
  });

  test('조직 context가 없으면 변환을 거부한다', () => {
    expect(() =>
      resolveAgentActor({
        langgraph_auth_user_id: 'user-a',
        langgraph_auth_user: {
          display_name: '사용자 A',
        },
      }),
    ).toThrow('인증된 Agent 조직 context가 없습니다.');
  });
});
