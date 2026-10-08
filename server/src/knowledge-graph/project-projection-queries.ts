export const UPSERT_PROJECT = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
MERGE (project:KGWorkOSProject {key: $sourceKey})
SET project.organizationId = $organizationId,
    project.sourceId = $sourceId,
    project.projectKey = $projectKey,
    project.name = $name,
    project.archivedAt = $archivedAt,
    project.sourceUpdatedAt = $sourceUpdatedAt,
    project.deleted = false
WITH marker, project
OPTIONAL MATCH (project)-[oldColumnRel:KG_PROJECT_COLUMN]->(oldColumn:KGWorkOSProjectColumn)
SET oldColumn.deleted = true
DELETE oldColumnRel
WITH marker, project
FOREACH (column IN $columns |
  MERGE (columnNode:KGWorkOSProjectColumn {key: column.key})
  SET columnNode.organizationId = $organizationId,
      columnNode.sourceId = column.id,
      columnNode.projectId = $sourceId,
      columnNode.name = column.name,
      columnNode.position = column.position,
      columnNode.isCompleted = column.isCompleted,
      columnNode.deleted = false
  MERGE (project)-[:KG_PROJECT_COLUMN]->(columnNode)
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = false
RETURN marker.appliedSeq AS appliedSeq
`;

export const TOMBSTONE_PROJECT = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
OPTIONAL MATCH (project:KGWorkOSProject {key: $sourceKey})
OPTIONAL MATCH (project)-[columnRel:KG_PROJECT_COLUMN]->(column:KGWorkOSProjectColumn)
SET column.deleted = true
DELETE columnRel
WITH marker, project
FOREACH (ignored IN CASE WHEN project IS NULL THEN [] ELSE [1] END |
  SET project.deleted = true
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = true
RETURN marker.appliedSeq AS appliedSeq
`;
