import {
  createWikiRelativeSelection,
  resolveWikiRelativeSelection,
} from '@core/features/wiki/collaboration/wiki-relative-selection';

import { describe, expect, it } from '@jest/globals';
import * as Y from 'yjs';

describe('위키 상대 선택 위치', () => {
  it('선택 앞에 원격 삽입이 생겨도 원래 문자 위치를 따라간다', () => {
    const document = new Y.Doc();
    const text = document.getText('markdown');
    text.insert(0, 'hello world');
    const selection = createWikiRelativeSelection(text, { start: 6, end: 11 });

    document.transact(() => text.insert(0, 'remote '), { remote: true });

    expect(resolveWikiRelativeSelection(document, text, selection)).toEqual({
      start: 13,
      end: 18,
    });
    expect(text.toString().slice(13, 18)).toBe('world');
  });

  it('범위를 벗어난 local selection을 현재 Y.Text 길이 안으로 제한한다', () => {
    const document = new Y.Doc();
    const text = document.getText('markdown');
    text.insert(0, 'abc');

    const selection = createWikiRelativeSelection(text, {
      start: -20,
      end: 999,
    });

    expect(resolveWikiRelativeSelection(document, text, selection)).toEqual({
      start: 0,
      end: 3,
    });
  });

  it('다른 Y.Doc의 relative position은 현재 문서 선택으로 해석하지 않는다', () => {
    const sourceDocument = new Y.Doc();
    const sourceText = sourceDocument.getText('markdown');
    sourceText.insert(0, 'source');
    const selection = createWikiRelativeSelection(sourceText, {
      start: 1,
      end: 2,
    });

    const targetDocument = new Y.Doc();
    const targetText = targetDocument.getText('markdown');
    targetText.insert(0, 'target');

    expect(
      resolveWikiRelativeSelection(targetDocument, targetText, selection),
    ).toBeNull();
  });
});
