import { parseWikiMarkdown } from '@core/features/wiki/wiki-markdown-parser';

import { describe, expect, it } from '@jest/globals';

describe('위키 Markdown live parser', () => {
  it('제목과 인라인 강조 문법을 range로 변환한다', () => {
    const ranges = parseWikiMarkdown(
      '# 제목\n**굵게** *기울임* ~~취소~~ `코드`',
    );

    expect(ranges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'h1', length: 2 }),
        expect.objectContaining({ type: 'bold', length: 2 }),
        expect.objectContaining({ type: 'italic', length: 3 }),
        expect.objectContaining({ type: 'strikethrough', length: 2 }),
        expect.objectContaining({ type: 'code', length: 2 }),
      ]),
    );
  });

  it('blockquote와 link를 편집 강조한다', () => {
    const ranges = parseWikiMarkdown('> 인용\n[문서](https://example.com)');

    expect(ranges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'blockquote', length: 2 }),
        expect.objectContaining({ type: 'link', length: 2 }),
      ]),
    );
  });

  it('과도하게 큰 문서는 live formatting을 생략한다', () => {
    expect(parseWikiMarkdown('a'.repeat(100_001))).toEqual([]);
  });
});
