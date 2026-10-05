import { buildWikiEntryNameCandidate } from '#server/wiki/domain/wiki-entry-name.js';

describe('위키 엔트리 이름 후보', () => {
  it('첫 시도는 요청 이름을 그대로 사용한다', () => {
    expect(buildWikiEntryNameCandidate('설계 문서', 0)).toBe('설계 문서');
  });

  it('충돌 시 01부터 두 자리 suffix를 붙인다', () => {
    expect(buildWikiEntryNameCandidate('설계 문서', 1)).toBe('설계 문서 (01)');
    expect(buildWikiEntryNameCandidate('설계 문서', 2)).toBe('설계 문서 (02)');
  });

  it('이미 suffix가 있는 이름은 다음 번호부터 이어간다', () => {
    expect(buildWikiEntryNameCandidate('설계 문서 (09)', 1)).toBe(
      '설계 문서 (10)',
    );
    expect(buildWikiEntryNameCandidate('설계 문서 (99)', 2)).toBe(
      '설계 문서 (101)',
    );
  });
});
