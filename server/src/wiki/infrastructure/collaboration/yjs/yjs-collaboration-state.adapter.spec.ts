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

  it.each([new Uint8Array(), new Uint8Array([255, 255, 255])])(
    '비어 있거나 손상된 Yjs bytes를 거부한다',
    (encodedState) => {
      expect(() => adapter.decode(encodedState)).toThrow(
        WikiCollaborationStateCorruptedError,
      );
    },
  );
});
