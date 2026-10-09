import type { OrganizationActorContext } from '@/organizations/organization-actor-context';

export abstract class GraphSourceAccessProvider {
  abstract assertReadable(
    actor: OrganizationActorContext,
    organizationId: string,
  ): Promise<void>;
  abstract isAdministrator(
    actor: OrganizationActorContext,
    organizationId: string,
  ): Promise<boolean>;
  abstract lockWikiWriter(
    organizationId: string,
    actorUserId: string,
    documentId: string,
  ): Promise<{ updatedAt: Date } | 'not_member' | 'not_found' | 'forbidden'>;
  abstract lockAdministrator(
    organizationId: string,
    actorUserId: string,
  ): Promise<boolean>;
}
