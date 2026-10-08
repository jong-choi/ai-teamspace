import { createHash } from 'node:crypto';

import {
  digestGraphJson,
  stableGraphJson,
} from '@/knowledge-graph/domain/graph-json-digest';

describe('기존 curated 감사 digest 호환', () => {
  it('U-32 key 정렬·Date·undefined·배열 순서를 기존 감사 직렬화와 동일하게 유지한다', () => {
    const serialized =
      '{"a":[null,{"a":1,"b":2}],"when":"2026-10-09T00:00:00.000Z","z":null}';
    const value = {
      z: undefined,
      when: new Date('2026-10-09T09:00:00+09:00'),
      a: [undefined, { b: 2, a: 1 }],
    };
    expect(stableGraphJson(value)).toBe(serialized);
    expect(digestGraphJson(value)).toBe(
      createHash('sha256').update(serialized).digest('hex'),
    );
    expect(digestGraphJson({ a: value.a, when: value.when, z: value.z })).toBe(
      digestGraphJson(value),
    );
  });
});
