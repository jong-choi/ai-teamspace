import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';

export function toMcpOrganizationActor(
  auth: McpAuthContext,
): OrganizationActorContext {
  return { userId: auth.userId };
}
