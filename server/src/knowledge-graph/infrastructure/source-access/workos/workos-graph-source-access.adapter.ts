import { Injectable } from '@nestjs/common';

import { ApplicationError } from '@/application.error';
import { AuthMembershipLockService } from '@/auth/auth-membership-lock.service';
import { KnowledgeGraphAuthorizationUnavailableError } from '@/knowledge-graph/domain/graph-query.error';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import { OrganizationProviderFailureError } from '@/organizations/domain/organization.error';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';
import { WikiReferenceLockQueryService } from '@/wiki/wiki-reference-lock-query.service';

@Injectable()
export class WorkosGraphSourceAccessAdapter extends GraphSourceAccessProvider {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly membership: AuthMembershipLockService,
    private readonly wiki: WikiReferenceLockQueryService,
  ) {
    super();
  }

  async assertReadable(
    actor: OrganizationActorContext,
    organizationId: string,
  ) {
    await this.authorization(() =>
      this.organizations.getDetail(actor, organizationId),
    );
  }

  async isAdministrator(
    actor: OrganizationActorContext,
    organizationId: string,
  ) {
    const access = await this.authorization(() =>
      this.organizations.getDetail(actor, organizationId),
    );
    return access.role === 'owner' || access.role === 'admin';
  }

  async lockWikiWriter(
    organizationId: string,
    actorUserId: string,
    documentId: string,
  ) {
    return this.authorization(async () => {
      const role = await this.membership.lockRole(organizationId, actorUserId);
      if (!role) return 'not_member' as const;
      return (
        (await this.wiki.lockDocumentVersion(organizationId, documentId)) ??
        ('not_found' as const)
      );
    });
  }

  async lockAdministrator(organizationId: string, actorUserId: string) {
    return this.authorization(async () => {
      const role = await this.membership.lockRole(organizationId, actorUserId);
      return role === 'owner' || role === 'admin';
    });
  }

  private async authorization<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        !(error instanceof OrganizationProviderFailureError)
      ) {
        throw error;
      }
      throw new KnowledgeGraphAuthorizationUnavailableError({ cause: error });
    }
  }
}
