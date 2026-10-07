import type { McpAccessComposite } from '@repo/client/api-client/schemas';

export type McpAccessScope = McpAccessComposite['effectiveScopes'][number];

export const MCP_SCOPE_PRESENTATION = {
  'organizations:read': {
    label: '조직 조회',
    description: '조직과 멤버 정보를 읽습니다.',
  },
  'organizations:write': {
    label: '조직 변경',
    description: '허용된 조직 관리 작업을 수행합니다.',
  },
  'chat:read': {
    label: '채팅 조회',
    description: '대화와 메시지를 읽습니다.',
  },
  'chat:write': {
    label: '채팅 변경',
    description: '메시지 전송 등 채팅 변경 작업을 수행합니다.',
  },
  'wiki:read': {
    label: '위키 조회',
    description: '위키 문서를 검색하고 읽습니다.',
  },
  'wiki:write': {
    label: '위키 변경',
    description: '위키 문서를 만들거나 수정합니다.',
  },
  'projects:read': {
    label: '프로젝트 조회',
    description: '프로젝트와 업무를 읽습니다.',
  },
  'projects:write': {
    label: '프로젝트 변경',
    description: '프로젝트와 업무를 변경합니다.',
  },
  'calendar:read': {
    label: '일정 조회',
    description: '회의와 회의실 일정을 읽습니다.',
  },
  'calendar:write': {
    label: '일정 변경',
    description: '회의와 회의실 일정을 변경합니다.',
  },
} satisfies Record<McpAccessScope, { label: string; description: string }>;
