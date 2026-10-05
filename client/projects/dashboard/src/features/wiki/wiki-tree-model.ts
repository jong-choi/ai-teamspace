import type {
  WikiDocumentTreeNode,
  WikiTreeOutput as WikiTree,
} from '@repo/client/api-client/schemas';

export type WikiBreadcrumbSegment =
  | { id: 'wiki'; kind: 'root'; label: '위키' }
  | { id: string; kind: 'document'; label: string };

export function flattenWikiDocuments(tree: WikiTree): WikiDocumentTreeNode[] {
  const result: WikiDocumentTreeNode[] = [];
  const visit = (documents: readonly WikiDocumentTreeNode[]) => {
    for (const document of documents) {
      result.push(document);
      visit(document.children);
    }
  };
  visit(tree.documents);
  return result;
}

export function findWikiDocumentNode(
  tree: WikiTree,
  documentId: string,
): WikiDocumentTreeNode | null {
  return flattenWikiDocuments(tree).find(({ id }) => id === documentId) ?? null;
}

export function getWikiDocumentAncestors(
  tree: WikiTree,
  documentId: string,
): WikiDocumentTreeNode[] {
  const documents = flattenWikiDocuments(tree);
  const documentsById = new Map(
    documents.map((document) => [document.id, document]),
  );
  const document = documentsById.get(documentId);
  if (!document) return [];

  const ancestors: WikiDocumentTreeNode[] = [];
  const visited = new Set<string>();
  let parentDocumentId = document.parentDocumentId;

  while (parentDocumentId !== null) {
    if (visited.has(parentDocumentId)) break;
    visited.add(parentDocumentId);
    const parent = documentsById.get(parentDocumentId);
    if (!parent) break;
    ancestors.push(parent);
    parentDocumentId = parent.parentDocumentId;
  }

  return ancestors.reverse();
}

export function getWikiDocumentPathLabel(
  tree: WikiTree,
  documentId: string,
): string {
  const document = findWikiDocumentNode(tree, documentId);
  if (!document) return '위키 루트';
  return [
    ...getWikiDocumentAncestors(tree, documentId).map(({ title }) => title),
    document.title,
  ].join(' / ');
}

export function getWikiDocumentBreadcrumb(
  tree: WikiTree,
  document: Pick<WikiDocumentTreeNode, 'id' | 'title'>,
): WikiBreadcrumbSegment[] {
  return [
    { id: 'wiki', kind: 'root', label: '위키' },
    ...getWikiDocumentAncestors(tree, document.id).map((ancestor) => ({
      id: ancestor.id,
      kind: 'document' as const,
      label: ancestor.title,
    })),
    { id: document.id, kind: 'document', label: document.title },
  ];
}

export function getWikiExpandedAncestorIds(
  tree: WikiTree,
  documentId?: string,
): string[] {
  if (!documentId) return [];
  return getWikiDocumentAncestors(tree, documentId).map(({ id }) => id);
}

export function getWikiDocumentDescendantIds(
  tree: WikiTree,
  documentId: string,
): Set<string> {
  const result = new Set<string>();
  const document = findWikiDocumentNode(tree, documentId);
  if (!document) return result;

  const queue = [...document.children];
  while (queue.length > 0) {
    const child = queue.shift();
    if (!child || result.has(child.id)) continue;
    result.add(child.id);
    queue.push(...child.children);
  }
  return result;
}

export function getWikiTreeChildren(
  tree: WikiTree,
  parentDocumentId: string | null,
): WikiDocumentTreeNode[] {
  if (parentDocumentId === null) {
    return [...tree.documents].sort(compareWikiDocuments);
  }
  const parent = findWikiDocumentNode(tree, parentDocumentId);
  return parent ? [...parent.children].sort(compareWikiDocuments) : [];
}

function compareWikiDocuments(
  left: WikiDocumentTreeNode,
  right: WikiDocumentTreeNode,
): number {
  if (left.position !== right.position) return left.position - right.position;
  const byTitle = left.title.localeCompare(right.title, 'ko');
  return byTitle === 0 ? left.id.localeCompare(right.id) : byTitle;
}
