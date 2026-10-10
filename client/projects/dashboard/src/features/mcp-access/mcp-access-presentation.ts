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

// 채팅은 조직에 속하지 않아서 조직 정책과 무관하게 본인만 켜고 끈다.
const MCP_PERSONAL_DOMAINS: readonly McpAccessDomain[] = ['chat'];

export function isPersonalMcpScope(scope: McpAccessScope): boolean {
  return MCP_PERSONAL_DOMAINS.some((domain) => scope.startsWith(`${domain}:`));
}

export type McpDomainRow = (typeof MCP_DOMAIN_ROWS)[number];

// 조직 정책을 따르는 영역이다.
export const MCP_ORGANIZATION_ROWS: readonly McpDomainRow[] =
  MCP_DOMAIN_ROWS.filter((row) => !MCP_PERSONAL_DOMAINS.includes(row.domain));

// 본인만 설정하는 영역이다.
export const MCP_PERSONAL_ROWS: readonly McpDomainRow[] =
  MCP_DOMAIN_ROWS.filter((row) => MCP_PERSONAL_DOMAINS.includes(row.domain));

export const MCP_ACTION_COLUMNS = [
  { action: 'read', label: '조회' },
  { action: 'write', label: '변경' },
] as const;
