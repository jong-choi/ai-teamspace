export const SEMANTIC_GRAPH_INITIALIZATION = [
  'CREATE CONSTRAINT kg_semantic_chunk_key IF NOT EXISTS FOR (c:KGSemanticChunk) REQUIRE c.id IS UNIQUE',
  'CREATE CONSTRAINT kg_semantic_entity_key IF NOT EXISTS FOR (e:KGSemanticEntity) REQUIRE e.key IS UNIQUE',
  'CREATE INDEX kg_semantic_chunk_scope IF NOT EXISTS FOR (c:KGSemanticChunk) ON (c.organizationId, c.sourceKind, c.sourceId, c.generationId)',
  'CREATE INDEX kg_semantic_entity_scope IF NOT EXISTS FOR (e:KGSemanticEntity) ON (e.organizationId, e.sourceKind, e.sourceId, e.generationId)',
  'CREATE VECTOR INDEX kg_semantic_chunk_embedding_v1 IF NOT EXISTS FOR (c:KGSemanticChunk) ON c.embedding OPTIONS { indexConfig: { `vector.dimensions`: 768, `vector.similarity_function`: "cosine" } }',
] as const;

export const STAGE_SEMANTIC_ENTITIES = `
UNWIND $entities AS row
MATCH (c:KGSemanticChunk {id: row.chunkKey})
WHERE c.organizationId=$organizationId AND c.sourceKind=$sourceKind AND c.sourceId=$sourceId AND c.generationId=$generationId
MERGE (e:KGSemanticEntity {key: row.key})
ON CREATE SET e.organizationId=$organizationId, e.sourceKind=$sourceKind, e.sourceId=$sourceId,
 e.generationId=$generationId, e.chunkIndex=row.chunkIndex, e.localId=row.localId,
 e.entityType=row.entityType, e.normalizedName=row.normalizedName, e.evidenceDigest=row.evidenceDigest,
 e.occurrence=row.occurrence, e.extractorFingerprint=row.extractorFingerprint, e.factClass='extracted',
 e.embeddingSpace=$fingerprint, e.createdAt=$createdAt
MERGE (c)-[:KG_SEMANTIC_MENTIONS]->(e)
RETURN count(e) AS written`;

export const STAGE_SEMANTIC_RELATIONS = `
UNWIND $relations AS row
MATCH (s:KGSemanticEntity {key: row.sourceKey}), (t:KGSemanticEntity {key: row.targetKey})
WHERE s.organizationId=$organizationId AND t.organizationId=$organizationId
 AND s.sourceKind=$sourceKind AND t.sourceKind=$sourceKind
 AND s.sourceId=$sourceId AND t.sourceId=$sourceId
 AND s.generationId=$generationId AND t.generationId=$generationId
MERGE (s)-[r:KG_SEMANTIC_RELATION {key: row.key}]->(t)
ON CREATE SET r.predicate=row.predicate, r.organizationId=$organizationId, r.sourceKind=$sourceKind,
 r.sourceId=$sourceId, r.generationId=$generationId, r.chunkIndex=row.chunkIndex, r.factClass='extracted'
RETURN count(r) AS written`;

export const READ_SEMANTIC_CORRECTION_ENTITIES = `
MATCH (e:KGSemanticEntity)
WHERE e.organizationId=$organizationId AND e.sourceKind=$sourceKind
 AND e.sourceId=$sourceId AND e.generationId=$generationId
RETURN e.key AS key, e.localId AS localId, e.entityType AS entityType,
 e.normalizedName AS normalizedName, e.evidenceDigest AS evidenceDigest,
 e.occurrence AS occurrence, e.extractorFingerprint AS extractorFingerprint
ORDER BY e.key`;

export const READ_SEMANTIC_CORRECTION_RELATIONS = `
MATCH (s:KGSemanticEntity)-[r:KG_SEMANTIC_RELATION]->(t:KGSemanticEntity)
WHERE r.organizationId=$organizationId AND r.sourceKind=$sourceKind
 AND r.sourceId=$sourceId AND r.generationId=$generationId
 AND s.organizationId=$organizationId AND t.organizationId=$organizationId
 AND s.sourceId=$sourceId AND t.sourceId=$sourceId
 AND s.generationId=$generationId AND t.generationId=$generationId
RETURN r.key AS key, s.key AS sourceKey, t.key AS targetKey, r.predicate AS predicate
ORDER BY r.key`;

export function deleteSemanticNodesQuery(
  label: 'KGSemanticChunk' | 'KGSemanticEntity',
  oneGeneration: boolean,
) {
  return `MATCH (n:${label})
WHERE n.organizationId=$organizationId AND n.sourceKind=$sourceKind AND n.sourceId=$sourceId
 AND ${oneGeneration ? 'n.generationId=$generationId' : '($keep IS NULL OR n.generationId<>$keep) AND datetime(n.createdAt)<datetime($olderThan)'}
WITH n LIMIT 1000
DETACH DELETE n
RETURN count(*) AS deleted`;
}
