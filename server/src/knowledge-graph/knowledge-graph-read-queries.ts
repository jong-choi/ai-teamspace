export const READ_STRUCTURE_NODE_DETAIL = `
CALL {
  MATCH (node:KGWorkOSWikiDocument {key: $nodeId})
  WHERE node.organizationId = $organizationId
    AND coalesce(node.deleted, false) = false
  RETURN node.key AS id, 'wiki_document' AS kind,
    coalesce(node.title, node.sourceId, node.key) AS title,
    node.sourceId AS sourceId, node.sourceUpdatedAt AS sourceUpdatedAt
  UNION ALL
  MATCH (node:KGWorkOSProject {key: $nodeId})
  WHERE node.organizationId = $organizationId
    AND coalesce(node.deleted, false) = false
  RETURN node.key AS id, 'project' AS kind,
    coalesce(node.name, node.sourceId, node.key) AS title,
    node.sourceId AS sourceId, node.sourceUpdatedAt AS sourceUpdatedAt
  UNION ALL
  MATCH (node:KGWorkOSTicket {key: $nodeId})
  WHERE node.organizationId = $organizationId
    AND coalesce(node.deleted, false) = false
  RETURN node.key AS id, 'ticket' AS kind,
    coalesce(node.title, node.sourceId, node.key) AS title,
    node.sourceId AS sourceId, node.sourceUpdatedAt AS sourceUpdatedAt
  UNION ALL
  MATCH (node:KGWorkOSMeeting {key: $nodeId})
  WHERE node.organizationId = $organizationId
    AND coalesce(node.deleted, false) = false
  RETURN node.key AS id, 'meeting' AS kind,
    coalesce(node.title, node.sourceId, node.key) AS title,
    node.sourceId AS sourceId, node.sourceUpdatedAt AS sourceUpdatedAt
  UNION ALL
  MATCH (node:KGWorkOSUserReference {key: $nodeId})
  WHERE node.organizationId = $organizationId
    AND coalesce(node.deleted, false) = false
  RETURN node.key AS id, 'member' AS kind,
    coalesce(node.name, node.sourceId, node.key) AS title,
    node.sourceId AS sourceId, node.sourceUpdatedAt AS sourceUpdatedAt
  UNION ALL
  MATCH (node:KGCuratedNode {key: $nodeId})
  WHERE node.organizationId = $organizationId
    AND coalesce(node.deleted, false) = false
  RETURN node.key AS id, 'curated_node' AS kind,
    coalesce(node.title, node.sourceId, node.key) AS title,
    node.sourceId AS sourceId, node.sourceUpdatedAt AS sourceUpdatedAt
}
RETURN id, kind, title, sourceId, sourceUpdatedAt
LIMIT 1`;

export const READ_STRUCTURE_NEIGHBORS = `
UNWIND $frontierKeys AS frontierKey
CALL {
  WITH frontierKey
  CALL {
    WITH frontierKey
    MATCH (source:KGWorkOSWikiDocument {key: frontierKey})-[rel:KG_WIKI_PARENT]->(target:KGWorkOSWikiDocument)
    WHERE 'KG_WIKI_PARENT' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'wiki_document' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'wiki_document' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSWikiDocument)-[rel:KG_WIKI_PARENT]->(target:KGWorkOSWikiDocument {key: frontierKey})
    WHERE 'KG_WIKI_PARENT' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'wiki_document' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'wiki_document' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSTicket {key: frontierKey})-[rel:KG_TICKET_PROJECT]->(target:KGWorkOSProject)
    WHERE 'KG_TICKET_PROJECT' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'ticket' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'project' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSTicket)-[rel:KG_TICKET_PROJECT]->(target:KGWorkOSProject {key: frontierKey})
    WHERE 'KG_TICKET_PROJECT' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'ticket' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'project' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSTicket {key: frontierKey})-[rel:KG_TICKET_ASSIGNEE]->(target:KGWorkOSUserReference)
    WHERE 'KG_TICKET_ASSIGNEE' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'ticket' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSTicket)-[rel:KG_TICKET_ASSIGNEE]->(target:KGWorkOSUserReference {key: frontierKey})
    WHERE 'KG_TICKET_ASSIGNEE' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'ticket' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSTicket {key: frontierKey})-[rel:KG_TICKET_REPORTER]->(target:KGWorkOSUserReference)
    WHERE 'KG_TICKET_REPORTER' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'ticket' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSTicket)-[rel:KG_TICKET_REPORTER]->(target:KGWorkOSUserReference {key: frontierKey})
    WHERE 'KG_TICKET_REPORTER' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'ticket' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSProject {key: frontierKey})-[rel:KG_PROJECT_LEAD]->(target:KGWorkOSUserReference)
    WHERE 'KG_PROJECT_LEAD' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'project' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSProject)-[rel:KG_PROJECT_LEAD]->(target:KGWorkOSUserReference {key: frontierKey})
    WHERE 'KG_PROJECT_LEAD' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'project' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSProject {key: frontierKey})-[rel:KG_PROJECT_CREATOR]->(target:KGWorkOSUserReference)
    WHERE 'KG_PROJECT_CREATOR' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'project' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSProject)-[rel:KG_PROJECT_CREATOR]->(target:KGWorkOSUserReference {key: frontierKey})
    WHERE 'KG_PROJECT_CREATOR' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'project' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSMeeting {key: frontierKey})-[rel:KG_MEETING_ORGANIZER]->(target:KGWorkOSUserReference)
    WHERE 'KG_MEETING_ORGANIZER' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'meeting' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSMeeting)-[rel:KG_MEETING_ORGANIZER]->(target:KGWorkOSUserReference {key: frontierKey})
    WHERE 'KG_MEETING_ORGANIZER' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'meeting' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSMeeting {key: frontierKey})-[rel:KG_MEETING_ATTENDEE]->(target:KGWorkOSUserReference)
    WHERE 'KG_MEETING_ATTENDEE' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'meeting' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
    UNION ALL
    WITH frontierKey
    MATCH (source:KGWorkOSMeeting)-[rel:KG_MEETING_ATTENDEE]->(target:KGWorkOSUserReference {key: frontierKey})
    WHERE 'KG_MEETING_ATTENDEE' IN $relations
      AND source.organizationId = $organizationId
      AND target.organizationId = $organizationId
      AND coalesce(source.deleted, false) = false
      AND coalesce(target.deleted, false) = false
    RETURN type(rel) AS relationshipType,
      source.key AS sourceKey, 'meeting' AS sourceKind, source.sourceId AS sourceId,
      target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
  }
  WITH relationshipType, sourceKey, sourceKind, sourceId,
    targetKey, targetKind, targetId
  ORDER BY relationshipType, sourceKey, targetKey
  LIMIT toInteger($perNodeLimit)
  RETURN relationshipType, sourceKey, sourceKind, sourceId,
    targetKey, targetKind, targetId
}
RETURN frontierKey, relationshipType, sourceKey, sourceKind, sourceId,
  targetKey, targetKind, targetId
ORDER BY frontierKey, relationshipType, sourceKey, targetKey`;

export const READ_STRUCTURE_EDGES = `
CALL {
  MATCH (source:KGWorkOSWikiDocument)-[rel:KG_WIKI_PARENT]->(target:KGWorkOSWikiDocument)
  WHERE 'KG_WIKI_PARENT' IN $relations
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'wiki_document' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'wiki_document' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSTicket)-[rel:KG_TICKET_PROJECT]->(target:KGWorkOSProject)
  WHERE 'KG_TICKET_PROJECT' IN $relations
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'ticket' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'project' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSTicket)-[rel:KG_TICKET_ASSIGNEE]->(target:KGWorkOSUserReference)
  WHERE 'KG_TICKET_ASSIGNEE' IN $relations
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'ticket' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSTicket)-[rel:KG_TICKET_REPORTER]->(target:KGWorkOSUserReference)
  WHERE 'KG_TICKET_REPORTER' IN $relations
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'ticket' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSProject)-[rel:KG_PROJECT_LEAD]->(target:KGWorkOSUserReference)
  WHERE 'KG_PROJECT_LEAD' IN $relations
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'project' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSProject)-[rel:KG_PROJECT_CREATOR]->(target:KGWorkOSUserReference)
  WHERE 'KG_PROJECT_CREATOR' IN $relations
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'project' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSMeeting)-[rel:KG_MEETING_ORGANIZER]->(target:KGWorkOSUserReference)
  WHERE 'KG_MEETING_ORGANIZER' IN $relations
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'meeting' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSMeeting)-[rel:KG_MEETING_ATTENDEE]->(target:KGWorkOSUserReference)
  WHERE 'KG_MEETING_ATTENDEE' IN $relations
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'meeting' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
}
WITH relationshipType, sourceKey, sourceKind, sourceId,
  targetKey, targetKind, targetId
WHERE $afterType IS NULL
  OR relationshipType > $afterType
  OR (relationshipType = $afterType AND sourceKey > $afterSourceKey)
  OR (
    relationshipType = $afterType
    AND sourceKey = $afterSourceKey
    AND targetKey > $afterTargetKey
  )
RETURN relationshipType, sourceKey, sourceKind, sourceId,
  targetKey, targetKind, targetId
ORDER BY relationshipType, sourceKey, targetKey
LIMIT toInteger($limit)`;

export const READ_STRUCTURE_EDGE_DETAIL = `
CALL {
  MATCH (source:KGWorkOSWikiDocument {key: $sourceKey})-[rel:KG_WIKI_PARENT]->(target:KGWorkOSWikiDocument {key: $targetKey})
  WHERE $relationshipType = 'KG_WIKI_PARENT'
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'wiki_document' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'wiki_document' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSTicket {key: $sourceKey})-[rel:KG_TICKET_PROJECT]->(target:KGWorkOSProject {key: $targetKey})
  WHERE $relationshipType = 'KG_TICKET_PROJECT'
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'ticket' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'project' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSTicket {key: $sourceKey})-[rel:KG_TICKET_ASSIGNEE]->(target:KGWorkOSUserReference {key: $targetKey})
  WHERE $relationshipType = 'KG_TICKET_ASSIGNEE'
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'ticket' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSTicket {key: $sourceKey})-[rel:KG_TICKET_REPORTER]->(target:KGWorkOSUserReference {key: $targetKey})
  WHERE $relationshipType = 'KG_TICKET_REPORTER'
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'ticket' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSProject {key: $sourceKey})-[rel:KG_PROJECT_LEAD]->(target:KGWorkOSUserReference {key: $targetKey})
  WHERE $relationshipType = 'KG_PROJECT_LEAD'
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'project' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSProject {key: $sourceKey})-[rel:KG_PROJECT_CREATOR]->(target:KGWorkOSUserReference {key: $targetKey})
  WHERE $relationshipType = 'KG_PROJECT_CREATOR'
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'project' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSMeeting {key: $sourceKey})-[rel:KG_MEETING_ORGANIZER]->(target:KGWorkOSUserReference {key: $targetKey})
  WHERE $relationshipType = 'KG_MEETING_ORGANIZER'
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'meeting' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
  UNION ALL
  MATCH (source:KGWorkOSMeeting {key: $sourceKey})-[rel:KG_MEETING_ATTENDEE]->(target:KGWorkOSUserReference {key: $targetKey})
  WHERE $relationshipType = 'KG_MEETING_ATTENDEE'
    AND source.organizationId = $organizationId
    AND target.organizationId = $organizationId
    AND coalesce(source.deleted, false) = false
    AND coalesce(target.deleted, false) = false
  RETURN type(rel) AS relationshipType,
    source.key AS sourceKey, 'meeting' AS sourceKind, source.sourceId AS sourceId,
    target.key AS targetKey, 'member' AS targetKind, target.sourceId AS targetId
}
RETURN relationshipType, sourceKey, sourceKind, sourceId,
  targetKey, targetKind, targetId
LIMIT 1`;

export const READ_SEMANTIC_ENTITIES_FOR_SCOPES = `
UNWIND $scopes AS scope
MATCH (entity:KGSemanticEntity)
WHERE entity.organizationId = $organizationId
  AND entity.sourceKind = 'wiki_document'
  AND entity.sourceId = scope.sourceId
  AND entity.generationId = scope.generationId
  AND ($q IS NULL OR toLower(entity.normalizedName) CONTAINS toLower($q))
  AND (
    $afterTitle IS NULL OR entity.normalizedName > $afterTitle OR
    (entity.normalizedName = $afterTitle AND entity.key > $afterKey)
  )
RETURN entity.key AS id,
  entity.normalizedName AS title,
  entity.localId AS localId,
  entity.evidenceDigest AS evidenceDigest,
  entity.sourceId AS sourceId,
  entity.generationId AS generationId
ORDER BY title, id
LIMIT toInteger($limit)`;

export const GRAPH_STRUCTURE_RELATION_TYPES = [
  'KG_WIKI_PARENT',
  'KG_TICKET_PROJECT',
  'KG_TICKET_ASSIGNEE',
  'KG_TICKET_REPORTER',
  'KG_PROJECT_LEAD',
  'KG_PROJECT_CREATOR',
  'KG_MEETING_ORGANIZER',
  'KG_MEETING_ATTENDEE',
] as const;
