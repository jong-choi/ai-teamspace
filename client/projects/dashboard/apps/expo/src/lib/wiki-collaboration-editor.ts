import type {
  WikiEditorCompositionCallbacks,
  WikiEditorSelectionGeometry,
} from '@core/features/wiki/collaboration/wiki-collaboration-platform';

export function bindWikiEditorComposition(
  _handle: unknown,
  _callbacks: WikiEditorCompositionCallbacks,
): () => void {
  void _handle;
  void _callbacks;
  return () => undefined;
}

export function bindWikiEditorGeometryInvalidation(
  _handle: unknown,
  _onInvalidate: () => void,
): () => void {
  void _handle;
  void _onInvalidate;
  return () => undefined;
}

export function measureWikiEditorSelection(
  _handle: unknown,
  _selection: { start: number; end: number },
): WikiEditorSelectionGeometry | null {
  void _handle;
  void _selection;
  return null;
}
