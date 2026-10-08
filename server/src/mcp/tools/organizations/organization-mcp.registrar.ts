import { Inject, Injectable } from '@nestjs/common';

import { bindMcpTool, type BoundMcpTool } from '@/mcp/tools/bound-mcp-tool';
import { toMcpOrganizationActor } from '@/mcp/tools/mcp-application-actor';
import { organizationInvitationReceipt } from '@/mcp/tools/mcp-mutation-receipt.mapper';
import {
  organizationInvitationCreateTool,
  organizationMembersListTool,
  organizationsListTool,
} from '@/mcp/tools/organizations/organization-tool-definitions';
import { OrganizationInvitationsService } from '@/organizations/organization-invitations.service';
import { OrganizationsService } from '@/organizations/organizations.service';

type OrganizationToolsService = Pick<
  OrganizationsService,
  'list' | 'listMembers'
>;

type OrganizationInvitationToolsService = Pick<
  OrganizationInvitationsService,
  'create'
>;

@Injectable()
export class OrganizationMcpRegistrar {
  constructor(
    @Inject(OrganizationsService)
    private readonly organizationsService: OrganizationToolsService,
    @Inject(OrganizationInvitationsService)
    private readonly invitationsService: OrganizationInvitationToolsService,
  ) {}

  tools(): BoundMcpTool[] {
    return [
      bindMcpTool(organizationsListTool, async (_input, auth) => {
        const result = await this.organizationsService.list(
          toMcpOrganizationActor(auth),
        );

        if (auth.allowedOrganizationIds === null) {
          return result;
        }

        const allowed = new Set(auth.allowedOrganizationIds);
        return {
          items: result.items.filter((organization) =>
            allowed.has(organization.id),
          ),
        };
      }),
      bindMcpTool(organizationMembersListTool, async (input, auth) => {
        const { organizationId, ...query } = input;
        return this.organizationsService.listMembers(
          toMcpOrganizationActor(auth),
          organizationId,
          query,
        );
      }),
      bindMcpTool(organizationInvitationCreateTool, async (input, auth) => {
        const { organizationId, ...body } = input;
        const result = await this.invitationsService.create(
          toMcpOrganizationActor(auth),
          organizationId,
          body,
        );
        return {
          result,
          mutation: organizationInvitationReceipt(organizationId, result),
        };
      }),
    ];
  }
}
