import { WikiCollaborationStateCorruptedError } from '@/wiki/domain/wiki.error';
import { YjsCollaborationStateAdapter } from '@/wiki/infrastructure/collaboration/yjs/yjs-collaboration-state.adapter';

import * as Y from 'yjs';

describe('위키 Yjs collaboration state adapter', () => {
  const adapter = new YjsCollaborationStateAdapter();

  it('Markdown 원문을 Y.Text markdown으로 보존한다', () => {
    const markdown = '# 안녕하세요\n\n한글 😀 é\n';
    const created = adapter.create(markdown);
    const decoded = adapter.decode(created.encodedState);

    expect(decoded.contentMarkdown).toBe(markdown);
    expect(decoded.encodedState.byteLength).toBeGreaterThan(0);
  });

  it('빈 문서도 decode 가능한 유효 Y.Doc state로 생성한다', () => {
    const created = adapter.create('');
    const document = new Y.Doc();

    expect(() => Y.applyUpdate(document, created.encodedState)).not.toThrow();
    expect(document.getText('markdown').toJSON()).toBe('');
  });

  it('본문 patch를 기존 상태 위의 공동편집 연산으로 적용한다', () => {
    const created = adapter.create('# 제목\n\n오늘 딴 귤 😀\n');

    const edited = adapter.applyTextPatch(created.encodedState, {
      index: 6,
      deleteCount: 2,
      insertText: '아침에',
    });

    expect(edited.contentMarkdown).toBe('# 제목\n\n아침에 딴 귤 😀\n');
    expect(adapter.decode(edited.encodedState).contentMarkdown).toBe(
      edited.contentMarkdown,
    );
  });

  it('patch를 적용한 상태는 같은 시점에 갈라진 다른 편집과 합쳐진다', () => {
    const created = adapter.create('첫 줄\n둘째 줄\n');
    const human = new Y.Doc();
    Y.applyUpdate(human, created.encodedState);
    human.getText('markdown').insert(0, '사람이 쓴 줄\n');

    const edited = adapter.applyTextPatch(created.encodedState, {
      index: 4,
      deleteCount: 2,
      insertText: '2번째',
    });
    Y.applyUpdate(human, edited.encodedState);

    expect(human.getText('markdown').toJSON()).toBe(
      '사람이 쓴 줄\n첫 줄\n2번째 줄\n',
    );
  });

  it.each([new Uint8Array(), new Uint8Array([255, 255, 255])])(
    '비어 있거나 손상된 Yjs bytes를 거부한다',
    (encodedState) => {
      expect(() => adapter.decode(encodedState)).toThrow(
        WikiCollaborationStateCorruptedError,
      );
    },
  );
});
