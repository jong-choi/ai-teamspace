import { createHash } from 'node:crypto';

import type { GraphDocument } from '@repo/knowledge-graph';
import { digestGraphJson } from '@/knowledge-graph/domain/graph-json-digest';
import { SemanticEntityAnchorSchema } from '@/knowledge-graph/domain/semantic-correction-anchor';
import type { SemanticGenerationContext } from '@/knowledge-graph/domain/semantic-generation';
import {
  semanticExtractorFingerprint,
  semanticOntology,
} from '@/knowledge-graph/domain/semantic-pipeline';
import {
  normalizeSemanticText,
  semanticTextHash,
} from '@/knowledge-graph/domain/semantic-source-signature';

import { z } from 'zod';

export const SemanticEntitySchema = SemanticEntityAnchorSchema.extend({
  key: z.string().regex(/^[0-9a-f]{64}$/),
  chunkKey: z.string().regex(/^[0-9a-f]{64}$/),
  chunkIndex: z.number().int().nonnegative(),
  localId: z.string().min(1).max(200),
});
export const SemanticRelationSchema = z.object({
  key: SemanticEntitySchema.shape.key,
  sourceKey: SemanticEntitySchema.shape.key,
  targetKey: SemanticEntitySchema.shape.key,
  chunkIndex: SemanticEntitySchema.shape.chunkIndex,
  predicate: z.enum(semanticOntology.allowedRelationships),
});
export type SemanticEntity = z.infer<typeof SemanticEntitySchema>;
export type SemanticRelation = z.infer<typeof SemanticRelationSchema>;

function hashText(text: string) {
  return createHash('sha256').update(text).digest('hex');
}
export function semanticChunkKey(
  context: SemanticGenerationContext,
  index: number,
) {
  return digestGraphJson([
    'kg-semantic-chunk',
    context.scope.organizationId,
    context.scope.aggregateKind,
    context.scope.aggregateId,
    context.signature,
    context.generationId,
    index,
  ]);
}

export function normalizeSemanticGraph(
  graph: GraphDocument,
  text: string,
  chunkIndex: number,
  context: SemanticGenerationContext,
  occurrences: Map<string, number>,
) {
  const entities: SemanticEntity[] = [];
  const relations: SemanticRelation[] = [];
  const nodes = new Map<string, SemanticEntity>();
  const seen = new Set<string>();
  let droppedNodes = 0;
  let droppedRelationships = 0;
  for (const node of graph.nodes) {
    const localId = String(node.id).normalize('NFKC').trim();
    const type = SemanticEntityAnchorSchema.shape.entityType.safeParse(
      node.type,
    );
    if (!localId || localId.length > 200 || !type.success) {
      droppedNodes++;
      continue;
    }
    const identity = JSON.stringify([type.data, localId]);
    if (nodes.has(identity)) continue;
    const normalizedName = localId.replace(/\s+/g, ' ').toLocaleLowerCase('ko');
    const normalizedText = normalizeSemanticText(text).normalize('NFKC');
    const position = normalizedText
      .toLocaleLowerCase('ko')
      .indexOf(normalizedName);
    const sentences = normalizedText.split(/(?<=[.!?。])\s+|\n/);
    const sentence =
      position < 0
        ? null
        : sentences.find((value) =>
            value.toLocaleLowerCase('ko').includes(normalizedName),
          );
    const occurrenceKey = JSON.stringify([type.data, normalizedName]);
    const occurrence = sentence ? (occurrences.get(occurrenceKey) ?? 0) + 1 : 1;
    if (sentence) occurrences.set(occurrenceKey, occurrence);
    const entity = SemanticEntitySchema.parse({
      v: 1,
      localId,
      entityType: type.data,
      normalizedName,
      evidenceDigest: sentence
        ? hashText(sentence.trim())
        : hashText(`chunk:${semanticTextHash(text)}`),
      occurrence,
      extractorFingerprint: semanticExtractorFingerprint,
      chunkIndex,
      chunkKey: semanticChunkKey(context, chunkIndex),
      key: digestGraphJson([
        'kg-semantic-entity',
        context.scope.organizationId,
        context.scope.aggregateKind,
        context.scope.aggregateId,
        context.signature,
        context.generationId,
        chunkIndex,
        type.data,
        localId,
      ]),
    });
    nodes.set(identity, entity);
    entities.push(entity);
  }
  for (const relation of graph.relationships) {
    const source = nodes.get(
      JSON.stringify([
        relation.source.type,
        String(relation.source.id).normalize('NFKC').trim(),
      ]),
    );
    const target = nodes.get(
      JSON.stringify([
        relation.target.type,
        String(relation.target.id).normalize('NFKC').trim(),
      ]),
    );
    const predicate = SemanticRelationSchema.shape.predicate.safeParse(
      relation.type,
    );
    if (!source || !target || !predicate.success) {
      droppedRelationships++;
      continue;
    }
    const key = digestGraphJson([
      'kg-semantic-rel',
      source.key,
      predicate.data,
      target.key,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    relations.push({
      key,
      sourceKey: source.key,
      targetKey: target.key,
      predicate: predicate.data,
      chunkIndex,
    });
  }
  return { entities, relations, droppedNodes, droppedRelationships };
}
