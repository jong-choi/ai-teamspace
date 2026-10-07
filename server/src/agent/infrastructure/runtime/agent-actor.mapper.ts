import type { AgentActor } from '@/agent/domain/agent-actor';

/** Agent runtime이 검증 뒤 주입한 server-owned principal만 제품 Agent actor로 변환한다. */
export function resolveAgentActor(
  configurable: Record<string, unknown> | undefined,
): AgentActor {
  const userId = configurable?.['langgraph_auth_user_id'];
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('인증된 Agent actor context가 없습니다.');
  }

  const user = configurable?.['langgraph_auth_user'];
  if (typeof user !== 'object' || user === null) {
    throw new Error('인증된 Agent actor principal이 없습니다.');
  }

  const organizationId =
    'organization_id' in user && typeof user.organization_id === 'string'
      ? user.organization_id
      : undefined;
  if (!organizationId) {
    throw new Error('인증된 Agent 조직 context가 없습니다.');
  }

  const displayName =
    'display_name' in user && typeof user.display_name === 'string'
      ? user.display_name
      : undefined;
  const rawPermissions = configurable?.['langgraph_auth_permissions'];
  const permissions = Array.isArray(rawPermissions)
    ? rawPermissions.filter(
        (value): value is string => typeof value === 'string',
      )
    : [];

  return {
    userId,
    organizationId,
    ...(displayName ? { displayName } : {}),
    permissions,
  };
}
