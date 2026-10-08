import {
  mutationToolOutputSchema,
  ProjectTicketMutationReceiptSchema,
} from '@/mcp/contracts/agent-mutation-receipt.dto';
import {
  consequentialWriteAnnotations,
  defineMcpTool,
  readOnlyAnnotations,
  writeAnnotations,
} from '@/mcp/tools/mcp-tool-definition';
import { CreateTicketSchema } from '@/projects/dto/create-ticket.dto';
import {
  MoveTicketResultSchema,
  MoveTicketSchema,
} from '@/projects/dto/move-ticket.dto';
import {
  ProjectDetailSchema,
  ProjectListSchema,
} from '@/projects/dto/project.dto';
import { TicketDetailSchema } from '@/projects/dto/ticket.dto';
import { UpdateTicketSchema } from '@/projects/dto/update-ticket.dto';

import { z } from 'zod';

const organizationIdField = {
  organizationId: z.string().trim().min(1),
};

const projectIdentityFields = {
  ...organizationIdField,
  projectId: z.string().trim().min(1),
};

const ticketIdentityFields = {
  ...projectIdentityFields,
  ticketId: z.string().trim().min(1),
};

export const projectsListTool = defineMcpTool({
  name: 'projects_list',
  title: '프로젝트 목록 조회',
  description:
    '명시한 조직의 프로젝트 목록을 조회합니다. projects:read scope와 현재 조직 멤버십을 모두 검증합니다.',
  inputSchema: z.object(organizationIdField),
  outputSchema: ProjectListSchema,
  requiredScope: 'projects:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const projectGetTool = defineMcpTool({
  name: 'project_get',
  title: '프로젝트 조회',
  description:
    '명시한 조직의 프로젝트 상세를 조회합니다. projectId만으로 tenant 경계를 추측하지 않고 organizationId를 명시적으로 검증합니다.',
  inputSchema: z.object(projectIdentityFields),
  outputSchema: ProjectDetailSchema,
  requiredScope: 'projects:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const projectTicketGetTool = defineMcpTool({
  name: 'project_ticket_get',
  title: '프로젝트 티켓 조회',
  description:
    '명시한 조직/프로젝트의 티켓 상세를 조회합니다. 현재 조직 접근과 project/ticket 소속을 기존 application service에서 검증합니다.',
  inputSchema: z.object(ticketIdentityFields),
  outputSchema: TicketDetailSchema,
  requiredScope: 'projects:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const projectTicketCreateTool = defineMcpTool({
  name: 'project_ticket_create',
  title: '프로젝트 티켓 생성',
  description:
    '명시한 조직/프로젝트에 티켓을 생성합니다. archived project, column, assignee membership 등 기존 Work OS invariant를 그대로 적용합니다.',
  inputSchema: CreateTicketSchema.extend(projectIdentityFields),
  outputSchema: mutationToolOutputSchema(
    TicketDetailSchema,
    ProjectTicketMutationReceiptSchema,
  ),
  requiredScope: 'projects:write',
  classification: 'write',
  annotations: writeAnnotations,
});

export const projectTicketUpdateTool = defineMcpTool({
  name: 'project_ticket_update',
  title: '프로젝트 티켓 수정',
  description:
    '명시한 조직/프로젝트의 티켓을 수정합니다. 기존 archived/assignee/concurrency 규칙과 현재 조직 접근 검증을 우회하지 않습니다.',
  inputSchema: UpdateTicketSchema.safeExtend(ticketIdentityFields),
  outputSchema: mutationToolOutputSchema(
    TicketDetailSchema,
    ProjectTicketMutationReceiptSchema,
  ),
  requiredScope: 'projects:write',
  classification: 'write',
  annotations: writeAnnotations,
});

export const projectTicketMoveTool = defineMcpTool({
  name: 'project_ticket_move',
  title: '프로젝트 티켓 이동',
  description:
    '티켓을 다른 column/position으로 이동합니다. 순서 변경은 다른 카드 위치에 영향을 줄 수 있으므로 consequential write이며 기존 ordering transaction을 사용합니다.',
  inputSchema: MoveTicketSchema.safeExtend(ticketIdentityFields),
  outputSchema: mutationToolOutputSchema(
    MoveTicketResultSchema,
    ProjectTicketMutationReceiptSchema,
  ),
  requiredScope: 'projects:write',
  classification: 'consequential',
  annotations: consequentialWriteAnnotations,
});

export const projectToolDefinitions = [
  projectsListTool,
  projectGetTool,
  projectTicketGetTool,
  projectTicketCreateTool,
  projectTicketUpdateTool,
  projectTicketMoveTool,
] as const;
