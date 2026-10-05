import * as Y from 'yjs';

export type WikiTextPatch = {
  index: number;
  deleteCount: number;
  insertText: string;
};

export function createWikiTextPatch(
  currentText: string,
  nextText: string,
): WikiTextPatch | null {
  if (currentText === nextText) return null;

  const currentCodePoints = Array.from(currentText);
  const nextCodePoints = Array.from(nextText);
  let prefixCodePointLength = 0;
  const maximumPrefixLength = Math.min(
    currentCodePoints.length,
    nextCodePoints.length,
  );
  while (
    prefixCodePointLength < maximumPrefixLength &&
    currentCodePoints[prefixCodePointLength] ===
      nextCodePoints[prefixCodePointLength]
  ) {
    prefixCodePointLength += 1;
  }

  let suffixCodePointLength = 0;
  const maximumSuffixLength = Math.min(
    currentCodePoints.length - prefixCodePointLength,
    nextCodePoints.length - prefixCodePointLength,
  );
  while (
    suffixCodePointLength < maximumSuffixLength &&
    currentCodePoints[currentCodePoints.length - 1 - suffixCodePointLength] ===
      nextCodePoints[nextCodePoints.length - 1 - suffixCodePointLength]
  ) {
    suffixCodePointLength += 1;
  }

  const currentPrefix = currentCodePoints
    .slice(0, prefixCodePointLength)
    .join('');
  const currentChanged = currentCodePoints
    .slice(
      prefixCodePointLength,
      currentCodePoints.length - suffixCodePointLength,
    )
    .join('');
  const nextChanged = nextCodePoints
    .slice(prefixCodePointLength, nextCodePoints.length - suffixCodePointLength)
    .join('');

  return {
    index: currentPrefix.length,
    deleteCount: currentChanged.length,
    insertText: nextChanged,
  };
}

export function applyWikiTextChange(
  text: Y.Text,
  nextText: string,
  origin: object,
): boolean {
  const patch = createWikiTextPatch(text.toString(), nextText);
  if (!patch) return false;

  text.doc?.transact(() => {
    if (patch.deleteCount > 0) {
      text.delete(patch.index, patch.deleteCount);
    }
    if (patch.insertText.length > 0) {
      text.insert(patch.index, patch.insertText);
    }
  }, origin);
  return true;
}

export type WikiYTextBinding = {
  applyLocalText: (nextText: string) => boolean;
  beginComposition: () => void;
  endComposition: () => void;
  destroy: () => void;
};

export function bindWikiYText(input: {
  text: Y.Text;
  localOrigin: object;
  onRemoteText: (nextText: string) => void;
}): WikiYTextBinding {
  const mainDocument = input.text.doc;
  if (!mainDocument) {
    throw new Error('위키 Y.Text는 Y.Doc에 연결된 뒤 바인딩해야 합니다.');
  }

  const shadowDocument = new Y.Doc();
  Y.applyUpdate(shadowDocument, Y.encodeStateAsUpdate(mainDocument));
  const shadowText = shadowDocument.getText('markdown');
  const shadowLocalOrigin = { kind: 'wiki-editor-shadow-local' };
  const mainRemoteOrigin = { kind: 'wiki-editor-main-remote' };
  let composing = false;
  let deferredRemoteUpdate = false;

  const shadowUpdateHandler = (update: Uint8Array, origin: unknown) => {
    if (origin !== shadowLocalOrigin) return;
    Y.applyUpdate(mainDocument, update, input.localOrigin);
  };

  const synchronizeShadowFromMain = (notifyEditor: boolean) => {
    Y.applyUpdate(
      shadowDocument,
      Y.encodeStateAsUpdate(mainDocument),
      mainRemoteOrigin,
    );
    deferredRemoteUpdate = false;
    if (notifyEditor) {
      input.onRemoteText(shadowText.toString());
    }
  };

  const mainUpdateHandler = (update: Uint8Array, origin: unknown) => {
    if (origin === input.localOrigin) return;
    if (composing) {
      deferredRemoteUpdate = true;
      return;
    }
    Y.applyUpdate(shadowDocument, update, mainRemoteOrigin);
    input.onRemoteText(shadowText.toString());
  };

  shadowDocument.on('update', shadowUpdateHandler);
  mainDocument.on('update', mainUpdateHandler);

  return {
    applyLocalText: (nextText) =>
      applyWikiTextChange(shadowText, nextText, shadowLocalOrigin),
    beginComposition: () => {
      composing = true;
    },
    endComposition: () => {
      if (!composing) return;
      composing = false;
      if (deferredRemoteUpdate) {
        synchronizeShadowFromMain(true);
      }
    },
    destroy: () => {
      mainDocument.off('update', mainUpdateHandler);
      shadowDocument.off('update', shadowUpdateHandler);
      shadowDocument.destroy();
    },
  };
}
