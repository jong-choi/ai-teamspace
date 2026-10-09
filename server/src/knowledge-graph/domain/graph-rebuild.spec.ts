import {
  canCancelGraphRebuild,
  canTransitionGraphRebuild,
  type GraphRebuildStatus,
  isGraphRebuildTerminal,
} from '@/knowledge-graph/domain/graph-rebuild';

describe('U8-14 rebuild 상태 전이', () => {
  const statuses: readonly GraphRebuildStatus[] = [
    'accepted',
    'running',
    'catching_up',
    'cancel_requested',
    'succeeded',
    'failed',
    'cancelled',
  ];

  const allowed = new Set<string>([
    'accepted:accepted',
    'accepted:running',
    'accepted:cancel_requested',
    'accepted:failed',
    'running:running',
    'running:catching_up',
    'running:cancel_requested',
    'running:failed',
    'catching_up:catching_up',
    'catching_up:succeeded',
    'catching_up:cancel_requested',
    'catching_up:failed',
    'cancel_requested:cancel_requested',
    'cancel_requested:cancelled',
    'cancel_requested:failed',
  ]);

  it('정의한 활성 상태 전이만 허용한다', () => {
    for (const from of statuses) {
      for (const to of statuses) {
        expect(canTransitionGraphRebuild(from, to)).toBe(
          allowed.has(`${from}:${to}`),
        );
      }
    }
  });

  it.each(['succeeded', 'failed', 'cancelled'] as const)(
    '종료 상태 %s에서는 같은 상태를 포함해 어떤 전이도 허용하지 않는다',
    (status) => {
      expect(isGraphRebuildTerminal(status)).toBe(true);
      for (const to of statuses) {
        expect(canTransitionGraphRebuild(status, to)).toBe(false);
      }
    },
  );

  it('cancel은 accepted/running/catching_up에서만 요청할 수 있다', () => {
    expect(statuses.filter((status) => canCancelGraphRebuild(status))).toEqual([
      'accepted',
      'running',
      'catching_up',
    ]);
  });
});
