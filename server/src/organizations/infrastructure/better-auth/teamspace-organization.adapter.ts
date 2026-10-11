import type { Auth } from '@/auth/auth';
import { organizationPlugin } from '@/auth/auth-options';

import { getOrgAdapter } from 'better-auth/plugins/organization';

type BetterAuthOrganizationContext = Parameters<typeof getOrgAdapter>[0];

export type TeamspaceOrganizationAuth = Omit<Auth, '$context'> & {
  $context: Promise<BetterAuthOrganizationContext>;
};

/**
 * Better Auth 1.7.7의 getOrgAdapter는 concrete auth option으로 생성된
 * PluginContext를 broad AuthContext로 받지 못하므로 이 경계에서만 호환한다.
 */
export function getTeamspaceOrganizationAdapter(context: TeamspaceAuthContext) {
  return getOrgAdapter(context, organizationPlugin.options);
}

type TeamspaceAuthContext = Awaited<TeamspaceOrganizationAuth['$context']>;
