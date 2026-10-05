import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import type { WikiDocumentSummary } from '#server/wiki/domain/wiki-document.js';
import { WikiDocumentSchema } from '#server/wiki/dto/wiki-document.dto.js';

import { z } from 'zod';

const WikiTreeDocumentBaseSchema = WikiDocumentSchema.omit({
  contentMarkdown: true,
});

export type WikiDocumentTreeNode = z.infer<
  typeof WikiTreeDocumentBaseSchema
> & {
  children: WikiDocumentTreeNode[];
};

export const WikiDocumentTreeNodeSchema: z.ZodType<WikiDocumentTreeNode> = z
  .lazy(() =>
    WikiTreeDocumentBaseSchema.extend({
      children: z.array(WikiDocumentTreeNodeSchema),
    }),
  )
  .meta({ id: 'WikiDocumentTreeNode' });

export const WikiTreeSchema = z
  .object({ documents: z.array(WikiDocumentTreeNodeSchema) })
  .meta({ id: 'WikiTree' });

export type WikiTreeResponse = z.infer<typeof WikiTreeSchema>;

export function toWikiTreeResponse(
  documents: WikiDocumentSummary[],
): WikiTreeResponse {
  const nodes = new Map<string, WikiDocumentTreeNode>();
  for (const document of documents) {
    nodes.set(document.id, {
      ...document,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      children: [],
    });
  }

  const roots: WikiDocumentTreeNode[] = [];
  for (const document of documents) {
    const node = nodes.get(document.id);
    if (!node) {
      continue;
    }
    if (document.parentDocumentId === null) {
      roots.push(node);
      continue;
    }
    const parent = nodes.get(document.parentDocumentId);
    if (parent) {
      parent.children.push(node);
    }
  }
  sortTreeNodes(roots);
  return WikiTreeSchema.parse({ documents: roots });
}

function sortTreeNodes(nodes: WikiDocumentTreeNode[]): void {
  nodes.sort(
    (left, right) =>
      left.position - right.position ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id),
  );
  for (const node of nodes) {
    sortTreeNodes(node.children);
  }
}

export class WikiTreeDto extends createZodDto(WikiTreeSchema) {}
