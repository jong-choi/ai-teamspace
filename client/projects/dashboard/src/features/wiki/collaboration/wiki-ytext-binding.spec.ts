import {
  applyWikiTextChange,
  bindWikiYText,
  createWikiTextPatch,
} from '@core/features/wiki/collaboration/wiki-ytext-binding';

import { describe, expect, it, jest } from '@jest/globals';
import * as Y from 'yjs';

describe('위키 Y.Text 바인딩', () => {
  it('중간 삽입을 전체 교체가 아닌 국소 patch로 계산한다', () => {
    expect(createWikiTextPatch('hello world', 'hello brave world')).toEqual({
      index: 6,
      deleteCount: 0,
      insertText: 'brave ',
    });
  });

  it('한글과 여러 줄 붙여넣기를 원본 문자열 그대로 적용한다', () => {
    const document = new Y.Doc();
    const text = document.getText('markdown');
    text.insert(0, '안녕하세요');
    const localOrigin = {};

    applyWikiTextChange(text, '안녕\n새 문단입니다', localOrigin);

    expect(text.toString()).toBe('안녕\n새 문단입니다');
  });

  it('emoji surrogate와 combining character를 손상하지 않는다', () => {
    const document = new Y.Doc();
    const text = document.getText('markdown');
    text.insert(0, 'A😀e\u0301Z');
    const localOrigin = {};

    applyWikiTextChange(text, 'A😃e\u0301!Z', localOrigin);

    expect(text.toString()).toBe('A😃e\u0301!Z');
  });

  it('local origin의 observer echo는 다시 editor에 전달하지 않는다', () => {
    const document = new Y.Doc();
    const text = document.getText('markdown');
    const localOrigin = {};
    const onRemoteText = jest.fn<(value: string) => void>();
    const binding = bindWikiYText({ text, localOrigin, onRemoteText });

    binding.applyLocalText('로컬 편집');

    expect(onRemoteText).not.toHaveBeenCalled();
    binding.destroy();
  });

  it('remote transaction은 현재 Y.Text 문자열을 editor에 전달한다', () => {
    const document = new Y.Doc();
    const text = document.getText('markdown');
    const localOrigin = {};
    const onRemoteText = jest.fn<(value: string) => void>();
    const binding = bindWikiYText({ text, localOrigin, onRemoteText });

    document.transact(() => text.insert(0, '원격 편집'), { remote: true });

    expect(onRemoteText).toHaveBeenLastCalledWith('원격 편집');
    binding.destroy();
  });

  it('한글 조합 중 remote update를 main Y.Doc에 유지하고 조합 종료 후 editor를 수렴시킨다', () => {
    const document = new Y.Doc();
    const text = document.getText('markdown');
    text.insert(0, 'hello');
    const localOrigin = {};
    const onRemoteText = jest.fn<(value: string) => void>();
    const binding = bindWikiYText({ text, localOrigin, onRemoteText });

    binding.beginComposition();
    binding.applyLocalText('hello가');
    document.transact(() => text.insert(0, 'remote '), { remote: true });
    binding.applyLocalText('hello각');

    expect(text.toString()).toBe('remote hello각');
    expect(onRemoteText).not.toHaveBeenCalled();

    binding.endComposition();

    expect(onRemoteText).toHaveBeenLastCalledWith('remote hello각');
    binding.destroy();
  });

  it('shadow editor에서 만든 local update도 main UndoManager의 local origin으로 추적한다', () => {
    const document = new Y.Doc();
    const text = document.getText('markdown');
    text.insert(0, '기준');
    const localOrigin = {};
    const onRemoteText = jest.fn<(value: string) => void>();
    const undoManager = new Y.UndoManager(text, {
      trackedOrigins: new Set([localOrigin]),
    });
    const binding = bindWikiYText({ text, localOrigin, onRemoteText });

    binding.applyLocalText('기준 로컬');
    document.transact(() => text.insert(text.length, ' 원격'), {
      remote: true,
    });
    undoManager.undo();

    expect(text.toString()).toBe('기준 원격');
    binding.destroy();
    undoManager.destroy();
  });

  it('두 Y.Doc의 동시 삽입을 교환하면 동일한 문자열로 수렴한다', () => {
    const documentA = new Y.Doc();
    const documentB = new Y.Doc();
    const textA = documentA.getText('markdown');
    const textB = documentB.getText('markdown');
    textA.insert(0, '시작');
    Y.applyUpdate(documentB, Y.encodeStateAsUpdate(documentA));

    applyWikiTextChange(textA, '시작 A', {});
    applyWikiTextChange(textB, '시작 B', {});
    const stateA = Y.encodeStateAsUpdate(documentA);
    const stateB = Y.encodeStateAsUpdate(documentB);

    Y.applyUpdate(documentA, stateB);
    Y.applyUpdate(documentB, stateA);

    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toContain('A');
    expect(textA.toString()).toContain('B');
  });

  it('UndoManager는 local origin 편집만 되돌리고 remote 편집은 유지한다', () => {
    const document = new Y.Doc();
    const text = document.getText('markdown');
    text.insert(0, '기준');
    const localOrigin = {};
    const undoManager = new Y.UndoManager(text, {
      trackedOrigins: new Set([localOrigin]),
    });

    applyWikiTextChange(text, '기준 로컬', localOrigin);
    document.transact(() => text.insert(text.length, ' 원격'), {
      remote: true,
    });
    undoManager.undo();

    expect(text.toString()).toBe('기준 원격');
    undoManager.destroy();
  });
});
