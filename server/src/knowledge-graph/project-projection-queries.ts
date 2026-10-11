export const UPSERT_PROJECT = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
MERGE (project:KGTeamspaceProject {key: $sourceKey})
SET project.organizationId = $organizationId,
    project.sourceId = $sourceId,
    project.projectKey = $projectKey,
    project.name = $name,
    project.archivedAt = $archivedAt,
    project.sourceUpdatedAt = $sourceUpdatedAt,
    project.placeholder = false,
    project.deleted = false
WITH DISTINCT marker, project
OPTIONAL MATCH (project)-[oldReference]->()
WHERE type(oldReference) IN ['KG_PROJECT_ORGANIZATION', 'KG_PROJECT_CREATOR', 'KG_PROJECT_LEAD']
DELETE oldReference
WITH DISTINCT marker, project
MERGE (organization:KGTeamspaceOrganization {key: $organizationKey})
ON CREATE SET organization.organizationId = $organizationId,
              organization.sourceId = $organizationId,
              organization.placeholder = true,
              organization.deleted = false
MERGE (project)-[:KG_PROJECT_ORGANIZATION]->(organization)
MERGE (creator:KGTeamspaceUserReference {key: $creatorKey})
ON CREATE SET creator.organizationId = $organizationId, creator.sourceId = $creatorUserId
MERGE (project)-[:KG_PROJECT_CREATOR]->(creator)
FOREACH (ignored IN CASE WHEN $leadKey IS NULL THEN [] ELSE [1] END |
  MERGE (lead:KGTeamspaceUserReference {key: $leadKey})
  ON CREATE SET lead.organizationId = $organizationId, lead.sourceId = $leadUserId
  MERGE (project)-[:KG_PROJECT_LEAD]->(lead)
)
WITH DISTINCT marker, project
OPTIONAL MATCH (project)-[oldColumnRel:KG_PROJECT_COLUMN]->(oldColumn:KGTeamspaceProjectColumn)
SET oldColumn.deleted = true
DELETE oldColumnRel
WITH DISTINCT marker, project
FOREACH (column IN $columns |
  MERGE (columnNode:KGTeamspaceProjectColumn {key: column.key})
  SET columnNode.organizationId = $organizationId,
      columnNode.sourceId = column.id,
      columnNode.projectId = $sourceId,
      columnNode.name = column.name,
      columnNode.position = column.position,
      columnNode.isCompleted = column.isCompleted,
      columnNode.placeholder = false,
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
OPTIONAL MATCH (project:KGTeamspaceProject {key: $sourceKey})
OPTIONAL MATCH (project)-[columnRel:KG_PROJECT_COLUMN]->(column:KGTeamspaceProjectColumn)
SET column.deleted = true
DELETE columnRel
WITH DISTINCT marker, project
OPTIONAL MATCH (project)-[ownedReference]->()
WHERE type(ownedReference) IN ['KG_PROJECT_ORGANIZATION', 'KG_PROJECT_CREATOR', 'KG_PROJECT_LEAD']
DELETE ownedReference
WITH DISTINCT marker, project
FOREACH (ignored IN CASE WHEN project IS NULL THEN [] ELSE [1] END |
  SET project.deleted = true
)
WITH DISTINCT marker, project
OPTIONAL MATCH (project)-[curatedReference:KG_CURATED_RELATED_TO]-()
WHERE curatedReference.organizationId = $organizationId
DELETE curatedReference
WITH DISTINCT marker
SET marker.appliedSeq = $sourceVersion, marker.deleted = true
RETURN marker.appliedSeq AS appliedSeq
`;
