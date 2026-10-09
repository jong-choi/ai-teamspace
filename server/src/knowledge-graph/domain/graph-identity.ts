import {
  GraphEdgeRelationSchema,
  GraphOwnerKindSchema,
} from '@/knowledge-graph/domain/graph-read-contract';

import { z } from 'zod';

const uuid = z.uuid();
const semanticKey = z.string().regex(/^[0-9a-f]{64}$/);
const uuidOwnerKind = GraphOwnerKindSchema.exclude(['member']);

export const GraphNodeIdentitySchema = z.union([
  z.tuple([z.literal(1), z.literal('s'), uuidOwnerKind, uuid]),
  z.tuple([
    z.literal(1),
    z.literal('s'),
    z.literal('member'),
    z.string().min(1).max(128),
  ]),
  z.tuple([z.literal(1), z.literal('c'), uuid]),
  z.tuple([
    z.literal(1),
    z.literal('e'),
    z.literal('wiki_document'),
    uuid,
    uuid,
    semanticKey,
  ]),
]);
export const GraphEdgeIdentitySchema = z.union([
  z.tuple([
    z.literal(1),
    z.literal('r'),
    GraphEdgeRelationSchema,
    z.string().min(1).max(512),
    z.string().min(1).max(512),
  ]),
  z.tuple([z.literal(1), z.literal('ce'), uuid]),
  z.tuple([z.literal(1), z.literal('sr'), uuid, uuid, semanticKey]),
  z.tuple([z.literal(1), z.literal('m'), uuid, uuid, semanticKey]),
  z.tuple([z.literal(1), z.literal('ar'), uuid]),
]);

export type GraphNodeIdentity = z.infer<typeof GraphNodeIdentitySchema>;
export type GraphEdgeIdentity = z.infer<typeof GraphEdgeIdentitySchema>;

export function encodeGraphNodeId(identity: GraphNodeIdentity): string {
  return encodeIdentity(GraphNodeIdentitySchema.parse(identity));
}
export function encodeGraphEdgeId(identity: GraphEdgeIdentity): string {
  return encodeIdentity(GraphEdgeIdentitySchema.parse(identity));
}
export function decodeGraphNodeId(value: string): GraphNodeIdentity {
  return decodeIdentity(value, GraphNodeIdentitySchema);
}
export function decodeGraphEdgeId(value: string): GraphEdgeIdentity {
  return decodeIdentity(value, GraphEdgeIdentitySchema);
}

function encodeIdentity(identity: readonly unknown[]): string {
  return Buffer.from(JSON.stringify(identity), 'utf8').toString('base64url');
}
function decodeIdentity<T>(value: string, schema: z.ZodType<T>): T {
  if (value.length > 512) throw new Error('그래프 식별자가 너무 깁니다.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new Error('그래프 식별자 형식이 올바르지 않습니다.');
  }
  return schema.parse(parsed);
}
