import {
  createWikiContentEditPatch,
  locateWikiContentEdit,
  WikiContentEditSchema,
} from '@/wiki/domain/wiki-content-edit';

const content = [
  '# 캠페인', // 1행
  '', // 2행
  '## 한 줄', // 3행
  '> 오늘 딴 귤, 내일 우리 집', // 4행
  '', // 5행
  '- 확인 필요', // 6행
  '- 일정 확정', // 7행
  '- 확인 필요', // 8행
].join('\n');

describe('위키 본문 부분 수정 위치 찾기', () => {
  it('startLine에서 시작하는 oldText의 위치를 돌려준다', () => {
    expect(
      locateWikiContentEdit(content, {
        startLine: 8,
        oldText: '- 확인 필요',
      }),
    ).toEqual({ kind: 'located', index: content.lastIndexOf('- 확인 필요') });
  });

  it('행 중간에서 시작하는 oldText도 그 행 번호로 찾는다', () => {
    expect(
      locateWikiContentEdit(content, { startLine: 4, oldText: '내일 우리 집' }),
    ).toEqual({ kind: 'located', index: content.indexOf('내일 우리 집') });
  });

  it('여러 행에 걸친 oldText는 첫 글자가 놓인 행으로 찾는다', () => {
    expect(
      locateWikiContentEdit(content, {
        startLine: 3,
        oldText: '## 한 줄\n> 오늘 딴 귤',
      }),
    ).toEqual({ kind: 'located', index: content.indexOf('## 한 줄') });
  });

  it('startLine이 틀려도 oldText가 한 곳뿐이면 그 위치를 쓴다', () => {
    expect(
      locateWikiContentEdit(content, {
        startLine: 1,
        oldText: '> 오늘 딴 귤, 내일 우리 집',
      }),
    ).toEqual({ kind: 'located', index: content.indexOf('> 오늘 딴 귤') });
  });

  it('startLine이 틀리고 oldText가 여러 곳이면 시작 행 번호를 모두 돌려준다', () => {
    expect(
      locateWikiContentEdit(content, {
        startLine: 7,
        oldText: '- 확인 필요',
      }),
    ).toEqual({
      kind: 'ambiguous',
      startLines: [6, 8],
      repeatedOnStartLine: false,
    });
  });

  it('startLine 안에서 oldText가 여러 번 시작하면 위치를 정하지 않는다', () => {
    expect(
      locateWikiContentEdit('귤 귤 귤\n귤', { startLine: 1, oldText: '귤' }),
    ).toEqual({
      kind: 'ambiguous',
      startLines: [1, 2],
      repeatedOnStartLine: true,
    });
  });

  it('oldText가 본문에 없으면 찾지 못했다고 알린다', () => {
    expect(
      locateWikiContentEdit(content, { startLine: 4, oldText: '없는 문구' }),
    ).toEqual({ kind: 'not_found' });
  });
});

describe('위키 본문 부분 수정 patch', () => {
  it('oldText와 newText의 공통 앞뒤를 빼고 달라진 구간만 남긴다', () => {
    expect(
      createWikiContentEditPatch(10, {
        oldText: '> 오늘 딴 귤, 내일 우리 집',
        newText: '> 아침에 딴 귤, 내일 우리 집',
      }),
    ).toEqual({ index: 12, deleteCount: 2, insertText: '아침에' });
  });

  it('뒤에 문구를 덧붙이면 삭제 없이 삽입만 한다', () => {
    expect(
      createWikiContentEditPatch(0, {
        oldText: '- 일정 확정',
        newText: '- 일정 확정\n- 알림 확인',
      }),
    ).toEqual({ index: 7, deleteCount: 0, insertText: '\n- 알림 확인' });
  });

  it('newText가 비어 있으면 oldText 전체를 지운다', () => {
    expect(
      createWikiContentEditPatch(3, { oldText: '삭제할 문구', newText: '' }),
    ).toEqual({ index: 3, deleteCount: 6, insertText: '' });
  });

  it('surrogate pair를 쪼개지 않는다', () => {
    expect(
      createWikiContentEditPatch(0, { oldText: '귤 😀', newText: '귤 😁' }),
    ).toEqual({ index: 2, deleteCount: 2, insertText: '😁' });
  });
});

describe('위키 본문 부분 수정 입력', () => {
  it('oldText와 newText가 같으면 거부한다', () => {
    expect(() =>
      WikiContentEditSchema.parse({
        startLine: 1,
        oldText: '같은 문구',
        newText: '같은 문구',
      }),
    ).toThrow();
  });

  it('빈 oldText와 1보다 작은 startLine은 거부한다', () => {
    expect(() =>
      WikiContentEditSchema.parse({ startLine: 1, oldText: '', newText: 'a' }),
    ).toThrow();
    expect(() =>
      WikiContentEditSchema.parse({ startLine: 0, oldText: 'a', newText: 'b' }),
    ).toThrow();
  });
});
