import { createWikiMarkdownFileName } from '@core/features/wiki/wiki-export';

import { describe, expect, it } from '@jest/globals';

describe('위키 Markdown 파일명', () => {
  it('확장자가 없으면 .md를 붙인다', () => {
    expect(createWikiMarkdownFileName('API 설계')).toBe('API 설계.md');
  });

  it('이미 .md 확장자가 있으면 중복하지 않는다', () => {
    expect(createWikiMarkdownFileName('README.MD')).toBe('README.MD');
  });

  it('파일 시스템에서 사용할 수 없는 문자를 안전하게 바꾼다', () => {
    expect(createWikiMarkdownFileName(' API/인증:*정책? ')).toBe(
      'API-인증--정책-.md',
    );
  });

  it('유효한 이름이 남지 않으면 fallback을 사용한다', () => {
    expect(createWikiMarkdownFileName('   ')).toBe('wiki-document.md');
  });
});
