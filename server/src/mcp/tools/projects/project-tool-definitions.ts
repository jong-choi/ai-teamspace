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
import { ProjectColumnListSchema } from '@/projects/dto/project-column.dto';
import { TicketDetailSchema } from '@/projects/dto/ticket.dto';
import { UpdateTicketSchema } from '@/projects/dto/update-ticket.dto';

import { z } from 'zod';

const organizationIdField = {
  organizationId: z.string().trim().min(1),
};

// HTTP route의 ParseUUIDPipe와 같이 UUID가 아닌 id는 DB 조회 전에 입력 오류로 거부한다.
const projectIdentityFields = {
  ...organizationIdField,
  projectId: z.uuid(),
};

const ticketIdentityFields = {
  ...projectIdentityFields,
  ticketId: z.uuid(),
};

export const projectsListTool = defineMcpTool({
  name: 'projects_list',
  title: '프로젝트 목록 조회',
  description:
    '조직의 프로젝트 목록을 조회합니다. 프로젝트마다 진행 중 티켓 수(activeTicketCount)와 완료 티켓 수(doneTicketCount)가 들어 있습니다.',
  inputSchema: z.object(organizationIdField),
  outputSchema: ProjectListSchema,
  requiredScope: 'projects:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const projectGetTool = defineMcpTool({
  name: 'project_get',
  title: '프로젝트 조회',
  description: '프로젝트 하나의 상세를 조회합니다.',
  inputSchema: z.object(projectIdentityFields),
  outputSchema: ProjectDetailSchema,
  requiredScope: 'projects:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const projectColumnsListTool = defineMcpTool({
  name: 'project_columns_list',
  title: '프로젝트 컬럼 목록 조회',
  description:
    '프로젝트의 칸반 컬럼을 순서대로 조회합니다. 결과의 id를 티켓 생성의 columnId와 티켓 이동의 targetColumnId에 씁니다.',
  inputSchema: z.object(projectIdentityFields),
  outputSchema: ProjectColumnListSchema,
  requiredScope: 'projects:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const projectTicketGetTool = defineMcpTool({
  name: 'project_ticket_get',
  title: '프로젝트 티켓 조회',
  description:
    '티켓 하나의 상세를 조회합니다. ticketId는 knowledge_search의 records에서 kind가 ticket인 항목의 sourceId입니다.',
  inputSchema: z.object(ticketIdentityFields),
  outputSchema: TicketDetailSchema,
  requiredScope: 'projects:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const projectTicketCreateTool = defineMcpTool({
  name: 'project_ticket_create',
  title: '프로젝트 티켓 생성',
  description: '프로젝트에 티켓을 만듭니다.',
  inputSchema: CreateTicketSchema.extend({
    ...projectIdentityFields,
    columnId: CreateTicketSchema.shape.columnId.describe(
      'project_columns_list 결과의 컬럼 id.',
    ),
    assigneeUserId: CreateTicketSchema.shape.assigneeUserId.describe(
      '담당자 userId. 생략하면 담당자 없이 만듭니다.',
    ),
    dueAt: CreateTicketSchema.shape.dueAt.describe(
      '마감 시각. 생략하면 마감 없이 만듭니다.',
    ),
  }),
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
    '티켓 내용을 수정합니다. 바꿀 인자만 넣습니다. 컬럼 이동은 project_ticket_move를 씁니다.',
  inputSchema: UpdateTicketSchema.safeExtend({
    ...ticketIdentityFields,
    assigneeUserId: UpdateTicketSchema.shape.assigneeUserId.describe(
      '새 담당자 userId. null이면 담당자를 비웁니다.',
    ),
    dueAt: UpdateTicketSchema.shape.dueAt.describe(
      '새 마감 시각. null이면 마감을 지웁니다.',
    ),
    archived: UpdateTicketSchema.shape.archived.describe(
      'true면 보관, false면 보관 해제.',
    ),
  }),
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
    '티켓을 다른 컬럼이나 같은 컬럼 안의 다른 순서로 옮깁니다. beforeTicketId와 afterTicketId를 모두 생략하면 대상 컬럼 맨 끝에 놓습니다.',
  inputSchema: MoveTicketSchema.safeExtend({
    ...ticketIdentityFields,
    beforeTicketId: MoveTicketSchema.shape.beforeTicketId.describe(
      '이 티켓 바로 앞에 놓습니다. afterTicketId와 함께 쓸 수 없습니다.',
    ),
    afterTicketId: MoveTicketSchema.shape.afterTicketId.describe(
      '이 티켓 바로 뒤에 놓습니다. beforeTicketId와 함께 쓸 수 없습니다.',
    ),
  }),
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
  projectColumnsListTool,
  projectTicketGetTool,
  projectTicketCreateTool,
  projectTicketUpdateTool,
  projectTicketMoveTool,
] as const;
