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
  description:
    '현재 인증된 사용자가 실제로 멤버인 조직 목록을 조회합니다. 현재 브라우저의 active organization을 추측하지 않으며 읽기 권한과 현재 멤버십을 모두 확인합니다.',
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
    '명시한 조직의 현재 멤버를 페이지 단위로 조회합니다. organizations:read scope만으로 접근을 보장하지 않으며 호출 시점의 조직 멤버십도 검증합니다.',
  inputSchema: QueryOrganizationMembersSchema.extend(
    explicitOrganizationIdSchema.shape,
  ),
  outputSchema: OrganizationMemberListSchema,
  requiredScope: 'organizations:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const organizationInvitationCreateTool = defineMcpTool({
  name: 'organization_invitation_create',
  title: '조직 초대 생성',
  description:
    '명시한 조직에 사용자를 초대하고 기존 Work OS 초대/Chat 전달 흐름을 실행합니다. organizations:write scope 외에도 현재 조직의 관리자 권한이 필요하며 외부 사용자에게 알림을 유발할 수 있습니다.',
  inputSchema: CreateOrganizationInvitationSchema.extend(
    explicitOrganizationIdSchema.shape,
  ),
  outputSchema: OrganizationInvitationResponseSchema,
  requiredScope: 'organizations:write',
  classification: 'consequential',
  annotations: consequentialWriteAnnotations,
});

export const organizationToolDefinitions = [
  organizationsListTool,
  organizationMembersListTool,
  organizationInvitationCreateTool,
] as const;
