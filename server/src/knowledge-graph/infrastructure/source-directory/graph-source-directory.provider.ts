import type { GraphOwnerKind } from '@/knowledge-graph/domain/graph-read-contract';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';

export type GraphDirectoryMember = {
  userId: string;
  title: string;
};

export abstract class GraphSourceDirectoryProvider {
  abstract listMembers(
    actor: OrganizationActorContext,
    organizationId: string,
    query: {
      q?: string | null;
      after?: { title: string; userId: string } | null;
      limit: number;
    },
  ): Promise<GraphDirectoryMember[]>;

  abstract countMembers(
    actor: OrganizationActorContext,
    organizationId: string,
    q?: string | null,
  ): Promise<number>;

  abstract countOwnerSources(
    organizationId: string,
    kind: Exclude<GraphOwnerKind, 'member'>,
    q?: string | null,
  ): Promise<number>;
}
