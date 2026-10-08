export const UPSERT_TICKET_LABEL = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
MERGE (label:KGWorkOSTicketLabel {key: $sourceKey})
SET label.organizationId = $organizationId,
    label.sourceId = $sourceId,
    label.projectId = $projectId,
    label.name = $name,
    label.color = $color,
    label.sourceUpdatedAt = $sourceUpdatedAt,
    label.placeholder = false,
    label.deleted = false
SET marker.appliedSeq = $sourceVersion, marker.deleted = false
RETURN marker.appliedSeq AS appliedSeq
`;

export const TOMBSTONE_TICKET_LABEL = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
OPTIONAL MATCH (label:KGWorkOSTicketLabel {key: $sourceKey})
FOREACH (ignored IN CASE WHEN label IS NULL THEN [] ELSE [1] END |
  SET label.deleted = true
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = true
RETURN marker.appliedSeq AS appliedSeq
`;
