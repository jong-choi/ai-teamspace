import { assertKnowledgeGraphTestEnvironment } from '@/knowledge-graph/testing/knowledge-graph-test-database';

import { describe } from '@jest/globals';

// opt-in이 없으면 건너뛰고, opt-in인데 환경이 틀리면 조용히 skip하지 않고 실패한다.
export function describeKnowledgeGraph(name: string, fn: () => void): void {
  if (process.env.KG_TEST_ALLOW_WRITE !== '1') {
    describe.skip(name, fn);
    return;
  }
  assertKnowledgeGraphTestEnvironment();
  describe(name, fn);
}

// 실제 규모·재시도·Jobs 재기동을 기다려 오래 걸리는 suite는 평소 회귀에서 건너뛰고
// KG_TEST_SLOW=1일 때만 실행한다. reason에는 오래 걸리는 이유를 남긴다.
export function describeSlowKnowledgeGraph(
  name: string,
  reason: string,
  fn: () => void,
): void {
  if (process.env.KG_TEST_SLOW !== '1') {
    describe.skip(`${name} (느린 시험: ${reason})`, fn);
    return;
  }
  describeKnowledgeGraph(name, fn);
}
