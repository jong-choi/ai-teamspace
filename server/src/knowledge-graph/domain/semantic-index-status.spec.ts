import { deriveSemanticIndexStatus } from '@/knowledge-graph/domain/semantic-index-status';
import {
  semanticCurrentFixture,
  semanticStateFixture,
} from '@/knowledge-graph/testing/semantic-state.fixture';

describe('의미 색인 status의 단일 판정 순서', () => {
  const fp = 'a'.repeat(64);
  const active = '10000000-0000-4000-8000-000000000010';
  const request = '10000000-0000-4000-8000-000000000011';
  const now = new Date('2026-10-09T00:00:00Z');
  const manual = {
    manualRequestSeq: 1,
    manualRequestId: request,
    manualRequestedAt: new Date(0),
  };
  const failed = {
    runStatus: 'failed',
    attemptSeq: 1,
    attemptManualSeq: 0,
    attemptFingerprint: fp,
    lastErrorCode: 'PROVIDER_UNAUTHORIZED',
  } as const;

  it('U7-15 없는 원본과 tombstone은 status로 존재를 노출하지 않는다', () => {
    expect(deriveSemanticIndexStatus(null, new Date(0), fp)).toBeNull();
    expect(
      deriveSemanticIndexStatus(
        semanticCurrentFixture({
          version: { desiredSeq: 1, deleted: true, updatedAt: new Date(0) },
        }),
        new Date(0),
        fp,
      ),
    ).toBeNull();
    expect(
      deriveSemanticIndexStatus(semanticCurrentFixture(), null, fp),
    ).toBeNull();
  });
  it('U7-15 유효 lease의 실행 상태가 수동 전달 표시보다 우선한다', () => {
    const current = semanticCurrentFixture({
      state: semanticStateFixture({
        ...manual,
        runStatus: 'running',
        leaseToken: request,
        leaseExpiresAt: new Date(now.getTime() + 1),
      }),
    });
    expect(deriveSemanticIndexStatus(current, new Date(0), fp)?.status).toBe(
      'running',
    );
  });
  it('U7-15 같은 요구의 종결 실패는 고정 오류 코드와 함께 실패로 표시한다', () => {
    const current = semanticCurrentFixture({
      state: semanticStateFixture(failed),
    });
    expect(deriveSemanticIndexStatus(current, new Date(0), fp)).toMatchObject({
      status: 'failed',
      errorCode: 'PROVIDER_UNAUTHORIZED',
    });
  });
  it('U7-15 수동 접수와 queue 전달 완료를 accepted·queued로 구분한다', () => {
    expect(
      deriveSemanticIndexStatus(
        semanticCurrentFixture({ state: semanticStateFixture(manual) }),
        now,
        fp,
      ),
    ).toMatchObject({ status: 'accepted', requestId: request });
    expect(
      deriveSemanticIndexStatus(
        semanticCurrentFixture({
          state: semanticStateFixture({ ...manual, manualDeliveredSeq: 1 }),
        }),
        now,
        fp,
      )?.status,
    ).toBe('queued');
  });
  it('U7-15 재시도 대기에는 새 quiet 대기를 덧붙이지 않고 queued로 표시한다', () => {
    expect(
      deriveSemanticIndexStatus(
        semanticCurrentFixture({
          state: semanticStateFixture({ runStatus: 'retry_waiting' }),
        }),
        now,
        fp,
      )?.status,
    ).toBe('queued');
  });
  it('U7-15 최초 관측이나 owner 변경 뒤 quiet 시간 미만은 waiting과 남은 시간을 표시한다', () => {
    expect(
      deriveSemanticIndexStatus(
        semanticCurrentFixture({ state: null }),
        now,
        fp,
      ),
    ).toMatchObject({ status: 'waiting', quietRemainingMs: null });
    expect(
      deriveSemanticIndexStatus(semanticCurrentFixture(), now, fp),
    ).toMatchObject({ status: 'waiting', quietRemainingMs: 30_000 });
    const observed = semanticCurrentFixture({
      state: semanticStateFixture({ observedAt: now }),
    });
    expect(
      deriveSemanticIndexStatus(observed, new Date(0), fp)?.quietRemainingMs,
    ).toBe(30_000);
  });
  it('U7-15 quiet 뒤 미처리 요구는 이전 활성 결과가 있으면 stale이다', () => {
    expect(
      deriveSemanticIndexStatus(
        semanticCurrentFixture({
          state: semanticStateFixture({ activeGenerationId: active }),
        }),
        new Date(0),
        fp,
      )?.status,
    ).toBe('stale');
    expect(
      deriveSemanticIndexStatus(semanticCurrentFixture(), new Date(0), fp)
        ?.status,
    ).toBe('not_indexed');
  });
  it('U7-15 요구를 만족해도 활성 pointer가 없으면 not_indexed다', () => {
    expect(
      deriveSemanticIndexStatus(
        semanticCurrentFixture({
          state: semanticStateFixture({
            indexedSeq: 1,
            indexedFingerprint: fp,
          }),
        }),
        new Date(0),
        fp,
      )?.status,
    ).toBe('not_indexed');
  });
  it('U7-15 현재 모델 공간과 모든 요구를 만족한 활성 결과만 up_to_date다', () => {
    const current = semanticCurrentFixture({
      state: semanticStateFixture({
        indexedSeq: 1,
        indexedFingerprint: fp,
        activeGenerationId: active,
      }),
    });
    expect(deriveSemanticIndexStatus(current, new Date(0), fp)?.status).toBe(
      'up_to_date',
    );
    expect(
      deriveSemanticIndexStatus(current, new Date(0), 'b'.repeat(64))?.status,
    ).toBe('stale');
  });
});
