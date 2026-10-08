import type { CuratedEdge } from '@/knowledge-graph/domain/curated-graph';

export const UPSERT_CURATED_NODE = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
MERGE (node:KGCuratedNode {key: $sourceKey})
SET node.organizationId = $organizationId,
    node.sourceId = $sourceId,
    node.kind = $kind,
    node.title = $title,
    node.propertiesJson = $propertiesJson,
    node.revision = $revision,
    node.placeholder = false,
    node.deleted = false
SET marker.appliedSeq = $sourceVersion, marker.deleted = false
RETURN marker.appliedSeq AS appliedSeq
`;

export const TOMBSTONE_CURATED_NODE = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
OPTIONAL MATCH (node:KGCuratedNode {key: $sourceKey})
OPTIONAL MATCH (node)-[edge:KG_CURATED_RELATED_TO]-()
WHERE edge.organizationId = $organizationId
DELETE edge
WITH DISTINCT marker, node
FOREACH (ignored IN CASE WHEN node IS NULL THEN [] ELSE [1] END |
  SET node.deleted = true
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = true
RETURN marker.appliedSeq AS appliedSeq
`;

export function upsertCuratedEdgeQuery(
  sourceKind: CuratedEdge['sourceNodeKind'],
  targetKind: CuratedEdge['targetNodeKind'],
) {
  return `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
UNWIND $endpointKeys AS endpointKey
WITH DISTINCT marker, endpointKey ORDER BY endpointKey
MERGE (endpointMarker:KGProjectionSource {key: endpointKey})
ON CREATE SET endpointMarker.appliedSeq = 0
SET endpointMarker.writeFence = coalesce(endpointMarker.writeFence, 0) + 1
WITH DISTINCT marker
MATCH (sourceMarker:KGProjectionSource {key: $sourceNodeKey})
MATCH (targetMarker:KGProjectionSource {key: $targetNodeKey})
OPTIONAL MATCH ()-[previous:KG_CURATED_RELATED_TO {organizationId: $organizationId, edgeId: $sourceId}]-()
DELETE previous
WITH DISTINCT marker, sourceMarker, targetMarker
FOREACH (ignored IN CASE WHEN coalesce(sourceMarker.deleted, false) OR coalesce(targetMarker.deleted, false) THEN [] ELSE [1] END |
  MERGE (source:${endpointLabel(sourceKind)} {key: $sourceNodeKey})
  ON CREATE SET source.organizationId = $organizationId,
                source.sourceId = $sourceNodeId,
                source.placeholder = true,
                source.deleted = false
  MERGE (target:${endpointLabel(targetKind)} {key: $targetNodeKey})
  ON CREATE SET target.organizationId = $organizationId,
                target.sourceId = $targetNodeId,
                target.placeholder = true,
                target.deleted = false
  MERGE (source)-[edge:KG_CURATED_RELATED_TO {organizationId: $organizationId, edgeId: $sourceId}]->(target)
  SET edge.predicate = $predicate,
    edge.directed = $directed,
    edge.propertiesJson = $propertiesJson,
    edge.revision = $revision,
    edge.deleted = false
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = false,
    marker.suppressed = coalesce(sourceMarker.deleted, false) OR coalesce(targetMarker.deleted, false)
RETURN marker.appliedSeq AS appliedSeq
`;
}

function endpointLabel(kind: CuratedEdge['sourceNodeKind']): string {
  switch (kind) {
    case 'curated_node':
      return 'KGCuratedNode';
    case 'wiki_document':
      return 'KGWorkOSWikiDocument';
    case 'project':
      return 'KGWorkOSProject';
    case 'ticket':
      return 'KGWorkOSTicket';
    case 'meeting':
      return 'KGWorkOSMeeting';
  }
}

export const TOMBSTONE_CURATED_EDGE = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
OPTIONAL MATCH ()-[edge:KG_CURATED_RELATED_TO {organizationId: $organizationId, edgeId: $sourceId}]-()
DELETE edge
WITH DISTINCT marker
SET marker.appliedSeq = $sourceVersion, marker.deleted = true
RETURN marker.appliedSeq AS appliedSeq
`;
