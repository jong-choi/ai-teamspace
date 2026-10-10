import type { McpAccessComposite } from '@repo/client/api-client/schemas';

export type McpAccessScope = McpAccessComposite['effectiveScopes'][number];

type McpAccessDomain = McpAccessScope extends `${infer Domain}:${string}`
  ? Domain
  : never;

// 권한 표의 행 순서와 한 줄 설명이다. 영역마다 조회·변경 두 칸을 가진다.
export const MCP_DOMAIN_ROWS = [
  { domain: 'organizations', label: '조직', description: '조직과 멤버 정보' },
  { domain: 'chat', label: '채팅', description: '대화와 메시지' },
  { domain: 'wiki', label: '위키', description: '위키 문서' },
  { domain: 'projects', label: '프로젝트', description: '프로젝트와 업무' },
  { domain: 'calendar', label: '일정', description: '회의와 회의실 일정' },
] as const satisfies readonly {
  domain: McpAccessDomain;
  label: string;
  description: string;
}[];

export const MCP_ACTION_COLUMNS = [
  { action: 'read', label: '조회' },
  { action: 'write', label: '변경' },
] as const;
