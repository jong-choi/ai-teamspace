import type {
  WikiEditorCompositionCallbacks,
  WikiEditorSelectionGeometry,
  WikiEditorSelectionRect,
} from '@core/features/wiki/collaboration/wiki-collaboration-platform';

type MarkdownTreeNode = {
  start: number;
  length: number;
  type: string;
  element: HTMLElement;
  childNodes: MarkdownTreeNode[];
  isGeneratingNewline?: boolean;
};

type MarkdownEditorElement = HTMLElement & {
  tree?: MarkdownTreeNode;
};

export function bindWikiEditorComposition(
  handle: unknown,
  callbacks: WikiEditorCompositionCallbacks,
): () => void {
  if (!(handle instanceof HTMLElement)) {
    return () => undefined;
  }

  const onCompositionStart = () => callbacks.onCompositionStart();
  const onCompositionEnd = () => callbacks.onCompositionEnd();
  handle.addEventListener('compositionstart', onCompositionStart);
  handle.addEventListener('compositionend', onCompositionEnd);

  return () => {
    handle.removeEventListener('compositionstart', onCompositionStart);
    handle.removeEventListener('compositionend', onCompositionEnd);
  };
}

export function bindWikiEditorGeometryInvalidation(
  handle: unknown,
  onInvalidate: () => void,
): () => void {
  if (!(handle instanceof HTMLElement)) {
    return () => undefined;
  }

  handle.addEventListener('scroll', onInvalidate, { passive: true });
  window.addEventListener('resize', onInvalidate, { passive: true });
  return () => {
    handle.removeEventListener('scroll', onInvalidate);
    window.removeEventListener('resize', onInvalidate);
  };
}

export function measureWikiEditorSelection(
  handle: unknown,
  selection: { start: number; end: number },
): WikiEditorSelectionGeometry | null {
  if (!(handle instanceof HTMLElement)) return null;
  const editor = handle as MarkdownEditorElement;
  if (!editor.tree) return null;

  const anchor = clampIndex(selection.start, editor.tree.length);
  const head = clampIndex(selection.end, editor.tree.length);
  const start = Math.min(anchor, head);
  const end = Math.max(anchor, head);
  const selectionRange = document.createRange();
  if (!setRangeBoundary(selectionRange, editor, start, 'start')) return null;
  if (!setRangeBoundary(selectionRange, editor, end, 'end')) return null;
  if (start === end) selectionRange.collapse(true);

  const editorRect = editor.getBoundingClientRect();
  const selectionRects =
    start === end
      ? []
      : Array.from(selectionRange.getClientRects())
          .filter((rect) => rect.height > 0)
          .map((rect) => toRelativeRect(rect, editorRect));

  const caretRange = document.createRange();
  if (!setRangeBoundary(caretRange, editor, head, 'start')) return null;
  caretRange.collapse(true);
  const caretDomRect =
    caretRange.getClientRects()[0] ??
    caretRange.getBoundingClientRect() ??
    editor.getBoundingClientRect();
  const caret = toRelativeRect(caretDomRect, editorRect);
  if (caret.height === 0) {
    caret.height = 20;
  }

  return { caret, selectionRects };
}

function setRangeBoundary(
  range: Range,
  editor: MarkdownEditorElement,
  index: number,
  boundary: 'start' | 'end',
): boolean {
  const tree = editor.tree;
  if (!tree) return false;
  const setBoundary =
    boundary === 'start'
      ? range.setStart.bind(range)
      : range.setEnd.bind(range);

  if (index >= tree.length) {
    setBoundary(editor, editor.childNodes.length);
    return true;
  }

  const treeNode = getTreeNodeByIndex(tree, index);
  if (!treeNode) return false;
  if (treeNode.type === 'br') {
    if (boundary === 'start') {
      range.setStartBefore(treeNode.element);
    } else {
      range.setEndBefore(treeNode.element);
    }
    return true;
  }

  const node = (treeNode.element.childNodes[0] ||
    treeNode.element) as ChildNode;
  setBoundary(node, clampRangeOffset(node, index - treeNode.start));
  return true;
}

function getTreeNodeByIndex(
  treeRoot: MarkdownTreeNode,
  index: number,
): MarkdownTreeNode | null {
  let element: MarkdownTreeNode | null = treeRoot;
  let childIndex = 0;
  let newLineGenerated = false;

  if (treeRoot.length === 0) return treeRoot;

  while (
    element &&
    element.childNodes.length > 0 &&
    childIndex < element.childNodes.length
  ) {
    const child: MarkdownTreeNode | undefined = element.childNodes[childIndex];
    if (!child) break;
    if (index >= child.start && index < child.start + child.length) {
      if (child.childNodes.length === 0) return child;
      element = child;
      childIndex = 0;
    } else if (
      (child.isGeneratingNewline ||
        newLineGenerated ||
        childIndex === element.childNodes.length - 1) &&
      index === child.start + child.length
    ) {
      newLineGenerated = true;
      if (child.childNodes.length === 0) return child;
      element = child;
      childIndex = 0;
    } else {
      childIndex += 1;
    }
  }
  return null;
}

function clampRangeOffset(node: ChildNode, offset: number): number {
  const maximum =
    node.nodeType === Node.TEXT_NODE
      ? (node.textContent ?? '').length
      : node.childNodes.length;
  return Math.max(0, Math.min(offset, maximum));
}

function clampIndex(index: number, maximum: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), maximum));
}

function toRelativeRect(
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  editorRect: Pick<DOMRect, 'left' | 'top'>,
): WikiEditorSelectionRect {
  return {
    x: rect.left - editorRect.left,
    y: rect.top - editorRect.top,
    width: rect.width,
    height: rect.height,
  };
}
