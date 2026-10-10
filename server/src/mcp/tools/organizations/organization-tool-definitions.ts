import {
  mutationToolOutputSchema,
  OrganizationInvitationMutationReceiptSchema,
} from '@/mcp/contracts/agent-mutation-receipt.dto';
import {
  consequentialWriteAnnotations,
  defineMcpTool,
  readOnlyAnnotations,
} from '@/mcp/tools/mcp-tool-definition';
import { CreateOrganizationInvitationSchema } from '@/organizations/dto/create-organization-invitation.dto';
import { OrganizationInvitationResponseSchema } from '@/organizations/dto/organization-invitation.dto';
import { OrganizationListSchema } from '@/organizations/dto/organization-list.dto';
import { OrganizationMemberListSchema } from '@/organizations/dto/organization-member-list.dto';
import { QueryOrganizationMembersSchema } from '@/organizations/dto/query-organization-members.dto';

import { z } from 'zod';

const explicitOrganizationIdSchema = z.object({
  organizationId: z.string().trim().min(1),
});

export const organizationsListTool = defineMcpTool({
  name: 'organizations_list',
  title: '조직 목록 조회',
  description: '사용자가 속한 조직 목록을 조회합니다.',
  inputSchema: z.object({}),
  outputSchema: OrganizationListSchema,
  requiredScope: 'organizations:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const organizationMembersListTool = defineMcpTool({
  name: 'organization_members_list',
  title: '조직 멤버 목록 조회',
  description:
    '조직 멤버와 각자의 역할을 조회합니다. 결과의 userId를 담당자·참석자 지정에 씁니다.',
  inputSchema: QueryOrganizationMembersSchema.extend({
    ...explicitOrganizationIdSchema.shape,
    search: QueryOrganizationMembersSchema.shape.search.describe(
      '검색어. 생략하면 전체 멤버입니다.',
    ),
    role: QueryOrganizationMembersSchema.shape.role.describe(
      '이 역할의 멤버만 조회합니다. 생략하면 모든 역할입니다.',
    ),
  }),
  outputSchema: OrganizationMemberListSchema,
  requiredScope: 'organizations:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const organizationInvitationCreateTool = defineMcpTool({
  name: 'organization_invitation_create',
  title: '조직 초대 생성',
  description:
    '사용자를 조직에 초대합니다. 관리자만 할 수 있고 상대에게 알림이 갑니다.',
  inputSchema: CreateOrganizationInvitationSchema.extend(
    explicitOrganizationIdSchema.shape,
  ),
  outputSchema: mutationToolOutputSchema(
    OrganizationInvitationResponseSchema,
    OrganizationInvitationMutationReceiptSchema,
  ),
  requiredScope: 'organizations:write',
  classification: 'consequential',
  annotations: consequentialWriteAnnotations,
});

export const organizationToolDefinitions = [
  organizationsListTool,
  organizationMembersListTool,
  organizationInvitationCreateTool,
] as const;
