import type { McpScope } from '@/mcp/contracts/mcp-scope';
import type { McpOrganizationPolicy } from '@/mcp-access/domain/mcp-organization-policy';
import type { McpUserPolicy } from '@/mcp-access/domain/mcp-user-policy';

export type McpAccessComposite = {
  organizationPolicy: McpOrganizationPolicy | null;
  userPolicy: McpUserPolicy | null;
};

export type McpPolicyUpdateResult<T> =
  | {
      status: 'updated';
      value: T;
    }
  | {
      status: 'not_found';
    }
  | {
      status: 'revision_conflict';
      currentRevision: number;
    };

export type McpOrganizationPolicyUpdateValue = {
  policy: McpOrganizationPolicy;
  affectedUserCount: number;
};

export abstract class McpAccessRepository {
  abstract findComposite(
    organizationId: string,
    userId: string,
  ): Promise<McpAccessComposite>;

  abstract ensureOrganizationPolicy(input: {
    organizationId: string;
    allowedScopes: readonly McpScope[];
    updatedByUserId: string | null;
  }): Promise<McpOrganizationPolicy>;

  abstract ensureUserPolicy(input: {
    organizationId: string;
    userId: string;
    requestedScopes: readonly McpScope[];
  }): Promise<McpUserPolicy>;

  abstract updateUserPolicyIfRevision(input: {
    organizationId: string;
    userId: string;
    requestedScopes: readonly McpScope[];
    expectedRevision: number;
  }): Promise<McpPolicyUpdateResult<McpUserPolicy>>;

  abstract updateOrganizationPolicyAndPruneUsers(input: {
    organizationId: string;
    allowedScopes: readonly McpScope[];
    expectedRevision: number;
    updatedByUserId: string;
  }): Promise<McpPolicyUpdateResult<McpOrganizationPolicyUpdateValue>>;

  abstract deleteUserPolicy(
    organizationId: string,
    userId: string,
  ): Promise<void>;
}
