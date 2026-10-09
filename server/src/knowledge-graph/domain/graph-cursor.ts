import { digestGraphJson } from '@/knowledge-graph/domain/graph-json-digest';
import {
  GraphEdgeRelationSchema,
  GraphNodeKindSchema,
} from '@/knowledge-graph/domain/graph-read-contract';

import { z } from 'zod';

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const nodeCursor = z
  .object({
    v: z.literal(1),
    endpoint: z.literal('nodes'),
    filterDigest: digest,
    after: z
      .object({
        kind: GraphNodeKindSchema,
        title: z.string().max(500),
        id: z.string().min(1).max(512),
      })
      .strict(),
  })
  .strict();
const edgeCursor = z
  .object({
    v: z.literal(1),
    endpoint: z.literal('edges'),
    filterDigest: digest,
    after: z
      .object({
        relation: GraphEdgeRelationSchema,
        id: z.string().min(1).max(512),
      })
      .strict(),
  })
  .strict();
const exploreCursor = z
  .object({
    v: z.literal(1),
    endpoint: z.literal('explore'),
    filterDigest: digest,
    after: z
      .object({
        hop: z.number().int().min(1).max(2),
        relation: GraphEdgeRelationSchema,
        nodeKind: GraphNodeKindSchema,
        nodeId: z.string().min(1).max(512),
      })
      .strict(),
  })
  .strict();

export const GraphCursorSchema = z.discriminatedUnion('endpoint', [
  nodeCursor,
  edgeCursor,
  exploreCursor,
]);
export type GraphCursor = z.infer<typeof GraphCursorSchema>;

export function graphCursorFilterDigest(input: object): string {
  return digestGraphJson(input);
}
export function encodeGraphCursor(cursor: GraphCursor): string {
  return Buffer.from(
    JSON.stringify(GraphCursorSchema.parse(cursor)),
    'utf8',
  ).toString('base64url');
}
export function decodeGraphCursor(
  value: string,
  expected: Pick<GraphCursor, 'endpoint' | 'filterDigest'>,
): GraphCursor {
  if (value.length > 2048) throw new Error('그래프 cursor가 너무 깁니다.');
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new Error('그래프 cursor 형식이 올바르지 않습니다.');
  }
  const cursor = GraphCursorSchema.parse(decoded);
  if (
    cursor.endpoint !== expected.endpoint ||
    cursor.filterDigest !== expected.filterDigest
  )
    throw new Error('그래프 cursor의 조회 범위가 일치하지 않습니다.');
  return cursor;
}
