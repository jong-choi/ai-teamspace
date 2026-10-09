import type { WikiKnowledgeGraphStatus } from '@repo/client/api-client/generated/schemas/wikiKnowledgeGraphStatus.zod';

const STATUS_LABEL: Record<WikiKnowledgeGraphStatus['status'], string | null> =
  {
    not_indexed: '색인 전',
    accepted: '갱신 요청됨',
    queued: '갱신 대기 중',
    running: '그래프 갱신 중',
    waiting: '자동 갱신 대기 중',
    up_to_date: null,
    stale: '갱신 필요',
    failed: '갱신 실패',
  };

export function wikiKnowledgeGraphStatusLabel(
  status: WikiKnowledgeGraphStatus['status'],
  latestRequestSatisfied: boolean,
  errorCode: string | null,
): string | null {
  if (status === 'up_to_date' && latestRequestSatisfied) return '업데이트 완료';
  if (status === 'failed' && errorCode) return `갱신 실패 · ${errorCode}`;
  return STATUS_LABEL[status];
}
