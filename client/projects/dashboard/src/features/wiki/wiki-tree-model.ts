import type {
  WikiFolder,
  WikiTree,
  WikiTreeDocument,
} from '@repo/client/api-client/schemas';

export type WikiBreadcrumbSegment =
  | { id: 'wiki'; kind: 'root'; label: '위키' }
  | { id: string; kind: 'folder'; label: string }
  | { id: string; kind: 'document'; label: string };

export type WikiTreeChildren = {
  folders: WikiFolder[];
  documents: WikiTreeDocument[];
};

export function getWikiTreeChildren(
  tree: WikiTree,
  parentFolderId: string | null,
): WikiTreeChildren {
  return {
    folders: tree.folders
      .filter((folder) => folder.parentFolderId === parentFolderId)
      .sort(compareByPositionThenName),
    documents: tree.documents
      .filter((document) => document.folderId === parentFolderId)
      .sort(compareByTitle),
  };
}

export function getWikiFolderAncestors(
  tree: WikiTree,
  folderId: string | null,
): WikiFolder[] {
  if (folderId === null) return [];

  const foldersById = new Map(
    tree.folders.map((folder) => [folder.id, folder]),
  );
  const ancestors: WikiFolder[] = [];
  const visited = new Set<string>();
  let currentFolderId: string | null = folderId;

  while (currentFolderId !== null) {
    if (visited.has(currentFolderId)) break;
    visited.add(currentFolderId);

    const folder = foldersById.get(currentFolderId);
    if (!folder) break;
    ancestors.push(folder);
    currentFolderId = folder.parentFolderId;
  }

  return ancestors.reverse();
}

export function getWikiFolderPathLabel(
  tree: WikiTree,
  folderId: string,
): string {
  const ancestors = getWikiFolderAncestors(tree, folderId);
  return ancestors.length > 0
    ? ancestors.map((folder) => folder.name).join(' / ')
    : '위키 루트';
}

export function getWikiDocumentBreadcrumb(
  tree: WikiTree,
  document: Pick<WikiTreeDocument, 'id' | 'folderId' | 'title'>,
): WikiBreadcrumbSegment[] {
  return [
    { id: 'wiki', kind: 'root', label: '위키' },
    ...getWikiFolderAncestors(tree, document.folderId).map((folder) => ({
      id: folder.id,
      kind: 'folder' as const,
      label: folder.name,
    })),
    { id: document.id, kind: 'document', label: document.title },
  ];
}

export function getWikiExpandedAncestorIds(
  tree: WikiTree,
  documentId?: string,
): string[] {
  if (!documentId) return [];
  const document = tree.documents.find((item) => item.id === documentId);
  if (!document) return [];
  return getWikiFolderAncestors(tree, document.folderId).map(
    (folder) => folder.id,
  );
}

export function getWikiFolderDescendantIds(
  tree: WikiTree,
  folderId: string,
): Set<string> {
  const result = new Set<string>();
  const queue = [folderId];

  while (queue.length > 0) {
    const parentId = queue.shift();
    if (!parentId) continue;

    for (const folder of tree.folders) {
      if (folder.parentFolderId !== parentId || result.has(folder.id)) continue;
      result.add(folder.id);
      queue.push(folder.id);
    }
  }

  return result;
}

function compareByPositionThenName(
  left: WikiFolder,
  right: WikiFolder,
): number {
  if (left.position !== right.position) return left.position - right.position;
  const byName = left.name.localeCompare(right.name, 'ko');
  return byName === 0 ? left.id.localeCompare(right.id) : byName;
}

function compareByTitle(
  left: WikiTreeDocument,
  right: WikiTreeDocument,
): number {
  const byTitle = left.title.localeCompare(right.title, 'ko');
  return byTitle === 0 ? left.id.localeCompare(right.id) : byTitle;
}
