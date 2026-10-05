import { type ReactNode, useMemo } from 'react';

import {
  WikiCollaborationPlatformProvider,
  type WikiCollaborationPlatformValue,
} from '@core/features/wiki/collaboration/wiki-collaboration-platform';
import {
  bindWikiEditorComposition,
  bindWikiEditorGeometryInvalidation,
  measureWikiEditorSelection,
} from '@/lib/wiki-collaboration-editor';
import {
  clearWikiCollaborationLocalStore,
  createWikiCollaborationLocalStore,
} from '@/lib/wiki-collaboration-local-store';

export function ExpoWikiCollaborationPlatformProvider({
  children,
}: {
  children: ReactNode;
}) {
  const value = useMemo<WikiCollaborationPlatformValue>(
    () => ({
      createLocalStore: createWikiCollaborationLocalStore,
      clearLocalStore: clearWikiCollaborationLocalStore,
      bindEditorComposition: bindWikiEditorComposition,
      bindEditorGeometryInvalidation: bindWikiEditorGeometryInvalidation,
      measureEditorSelection: measureWikiEditorSelection,
    }),
    [],
  );

  return (
    <WikiCollaborationPlatformProvider value={value}>
      {children}
    </WikiCollaborationPlatformProvider>
  );
}
