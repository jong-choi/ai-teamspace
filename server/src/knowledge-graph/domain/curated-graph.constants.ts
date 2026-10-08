export const CURATED_NODE_KINDS = ['custom'] as const;
export type CuratedNodeKind = (typeof CURATED_NODE_KINDS)[number];

export const CURATED_EDGE_PREDICATES = ['related_to'] as const;
export type CuratedEdgePredicate = (typeof CURATED_EDGE_PREDICATES)[number];
