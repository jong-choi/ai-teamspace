import {
  computeSemanticGaps,
  isSemanticTerminal,
} from '@/knowledge-graph/domain/semantic-source-gap';
import {
  semanticCurrentFixture,
  semanticStateFixture,
} from '@/knowledge-graph/testing/semantic-state.fixture';

describe('의미 색인의 최신 요구와 영구 실패 자격', () => {
  const fingerprint = 'a'.repeat(64);
  const combinations = Array.from({ length: 32 }, (_, index) => ({
    deleted: Boolean(index & 1),
    desired: Boolean(index & 2),
    manual: Boolean(index & 4),
    changedFingerprint: Boolean(index & 8),
    failed: Boolean(index & 16),
  }));
  it.each(combinations)(
    'U7-09 독립5조건의32개조합을기획의gap·terminal 정의와대조한다: %j',
    ({ deleted, desired, manual, changedFingerprint, failed }) => {
      const desiredSeq = desired ? 2 : 1;
      const state = semanticStateFixture({
        indexedSeq: 1,
        indexedManualSeq: 0,
        indexedFingerprint: changedFingerprint ? 'b'.repeat(64) : fingerprint,
        manualRequestSeq: manual ? 1 : 0,
        manualRequestId: manual ? '10000000-0000-4000-8000-000000000001' : null,
        manualRequestedAt: manual ? new Date(0) : null,
        runStatus: failed ? 'failed' : 'idle',
        attemptSeq: desiredSeq,
        attemptManualSeq: manual ? 1 : 0,
        attemptFingerprint: fingerprint,
      });
      const current = semanticCurrentFixture({
        version: { desiredSeq, deleted, updatedAt: new Date(0) },
        state,
      });
      expect(computeSemanticGaps(current, fingerprint)).toEqual({
        desired: !deleted && desired,
        manual: !deleted && manual,
        fingerprint: !deleted && changedFingerprint,
        none: deleted || !(desired || manual || changedFingerprint),
      });
      expect(isSemanticTerminal(current, fingerprint)).toBe(!deleted && failed);
    },
  );
  it('U7-09 상태가 없어도 registry의 desired 요구를 보존한다', () => {
    expect(
      computeSemanticGaps(semanticCurrentFixture({ state: null }), fingerprint),
    ).toEqual({
      desired: true,
      manual: false,
      fingerprint: false,
      none: false,
    });
  });
  it('U7-09 자동과 수동 요구가 모두 충족되면 새 모델 호출이 필요 없다', () => {
    const current = semanticCurrentFixture({
      state: semanticStateFixture({
        indexedSeq: 1,
        indexedFingerprint: fingerprint,
      }),
    });
    expect(computeSemanticGaps(current, fingerprint).none).toBe(true);
    expect(isSemanticTerminal(current, fingerprint)).toBe(false);
  });
  it.each(['failed', 'validation_failed'] as const)(
    'U7-09 %s는 같은 요구·모델에서는 종결하고 새 요구에서만 자격이 돌아온다',
    (runStatus) => {
      const state = semanticStateFixture({
        runStatus,
        attemptSeq: 1,
        attemptManualSeq: 0,
        attemptFingerprint: fingerprint,
      });
      const current = semanticCurrentFixture({ state });
      expect(isSemanticTerminal(current, fingerprint)).toBe(true);
      expect(
        isSemanticTerminal(
          { ...current, version: { ...current.version, desiredSeq: 2 } },
          fingerprint,
        ),
      ).toBe(false);
      expect(
        isSemanticTerminal(
          { ...current, state: { ...state, manualRequestSeq: 1 } },
          fingerprint,
        ),
      ).toBe(false);
      expect(isSemanticTerminal(current, 'b'.repeat(64))).toBe(false);
    },
  );
  it('U7-09 동일 indexed 서명이어도 수동 seq가 뒤처지면 force 요구가 남는다', () => {
    const current = semanticCurrentFixture({
      state: semanticStateFixture({
        indexedSeq: 1,
        indexedSignature: 'c'.repeat(64),
        indexedFingerprint: fingerprint,
        manualRequestSeq: 1,
      }),
    });
    expect(computeSemanticGaps(current, fingerprint)).toEqual({
      desired: false,
      manual: true,
      fingerprint: false,
      none: false,
    });
  });
  it('U7-09 모델 공간이 달라지면 이미 색인한 원본도 다시 처리한다', () => {
    const current = semanticCurrentFixture({
      state: semanticStateFixture({
        indexedSeq: 1,
        indexedFingerprint: 'b'.repeat(64),
      }),
    });
    expect(computeSemanticGaps(current, fingerprint).fingerprint).toBe(true);
  });
  it('U7-09 삭제된 source에는 자동·수동 생성 요구를 남기지 않는다', () => {
    const current = semanticCurrentFixture({
      version: { desiredSeq: 2, deleted: true, updatedAt: new Date(0) },
    });
    expect(computeSemanticGaps(current, fingerprint).none).toBe(true);
  });
});
