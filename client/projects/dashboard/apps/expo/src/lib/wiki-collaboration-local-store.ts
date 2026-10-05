import { Platform } from 'react-native';

import type {
  WikiCollaborationLocalDocumentKey,
  WikiCollaborationLocalStore,
} from '@core/features/wiki/collaboration/wiki-collaboration-platform';

export async function createWikiCollaborationLocalStore(
  key: WikiCollaborationLocalDocumentKey,
): Promise<WikiCollaborationLocalStore> {
  if (Platform.OS === 'web') {
    const { createWikiCollaborationLocalStore: createWebStore } =
      await import('@/lib/wiki-collaboration-local-store.web');
    return createWebStore(key);
  }

  const { createWikiCollaborationLocalStore: createNativeStore } =
    await import('@/lib/wiki-collaboration-local-store.native');
  return createNativeStore(key);
}

export async function clearWikiCollaborationLocalStore(
  key: WikiCollaborationLocalDocumentKey,
): Promise<void> {
  if (Platform.OS === 'web') {
    const { clearWikiCollaborationLocalStore: clearWebStore } =
      await import('@/lib/wiki-collaboration-local-store.web');
    await clearWebStore(key);
    return;
  }

  const { clearWikiCollaborationLocalStore: clearNativeStore } =
    await import('@/lib/wiki-collaboration-local-store.native');
  await clearNativeStore(key);
}
