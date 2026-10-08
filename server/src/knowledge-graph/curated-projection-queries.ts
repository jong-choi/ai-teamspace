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
FOREACH (ignored IN CASE WHEN node IS NULL THEN [] ELSE [1] END |
  SET node.deleted = true
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = true
RETURN marker.appliedSeq AS appliedSeq
`;

export const UPSERT_CURATED_EDGE = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
MERGE (source:KGCuratedNode {key: $sourceNodeKey})
ON CREATE SET source.organizationId = $organizationId,
              source.sourceId = $sourceNodeId,
              source.placeholder = true,
              source.deleted = false
MERGE (target:KGCuratedNode {key: $targetNodeKey})
ON CREATE SET target.organizationId = $organizationId,
              target.sourceId = $targetNodeId,
              target.placeholder = true,
              target.deleted = false
WITH marker, source, target
OPTIONAL MATCH ()-[previous:KG_CURATED_RELATED_TO {organizationId: $organizationId, edgeId: $sourceId}]-()
DELETE previous
WITH marker, source, target
MERGE (source)-[edge:KG_CURATED_RELATED_TO {organizationId: $organizationId, edgeId: $sourceId}]->(target)
SET edge.predicate = $predicate,
    edge.directed = $directed,
    edge.propertiesJson = $propertiesJson,
    edge.revision = $revision,
    edge.deleted = false
SET marker.appliedSeq = $sourceVersion, marker.deleted = false
RETURN marker.appliedSeq AS appliedSeq
`;

export const TOMBSTONE_CURATED_EDGE = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
OPTIONAL MATCH ()-[edge:KG_CURATED_RELATED_TO {organizationId: $organizationId, edgeId: $sourceId}]-()
DELETE edge
SET marker.appliedSeq = $sourceVersion, marker.deleted = true
RETURN marker.appliedSeq AS appliedSeq
`;
