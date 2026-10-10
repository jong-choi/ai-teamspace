import type { McpAccessScope } from '@core/features/mcp-access/mcp-access-presentation';

// 표의 한 칸에 들어가는 권한 요약이다. 예: "조회 3 · 변경 1"
export function summarizeMcpScopes(scopes: readonly McpAccessScope[]): string {
  const readCount = scopes.filter((scope) => scope.endsWith(':read')).length;
  const writeCount = scopes.length - readCount;
  return `조회 ${readCount} · 변경 ${writeCount}`;
}

export function formatMcpDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '확인 불가';
  return date.toLocaleDateString();
}

// 접근 키 발급·교체 요청마다 새로 만드는 Idempotency-Key다. 표시 가능한 ASCII만 쓴다.
export function createMcpIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
