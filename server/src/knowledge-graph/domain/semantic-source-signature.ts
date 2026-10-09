import { createHash } from 'node:crypto';

import { digestGraphJson } from '@/knowledge-graph/domain/graph-json-digest';
import type { WikiSemanticSource } from '@/wiki/domain/wiki-semantic-source';

export function normalizeSemanticText(text: string): string {
  return text.normalize('NFC').replace(/\r\n?/g, '\n').trimEnd();
}
export function semanticTextHash(text: string): string {
  return createHash('sha256').update(normalizeSemanticText(text)).digest('hex');
}

export function computeSemanticSourceSignature(
  snapshot: WikiSemanticSource,
): string {
  return digestGraphJson({
    v: 1,
    title: snapshot.title,
    parentDocumentId: snapshot.parentDocumentId,
    position: snapshot.position,
    contentMarkdown: normalizeSemanticText(snapshot.contentMarkdown),
  });
}
