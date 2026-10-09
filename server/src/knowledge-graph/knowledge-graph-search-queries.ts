export const SEMANTIC_CHUNK_VECTOR_INDEX = 'kg_semantic_chunk_embedding_v1';

export const SEARCH_SEMANTIC_EXACT = `
UNWIND $scopes AS s
MATCH (c:KGSemanticChunk {organizationId: $organizationId, sourceKind: 'wiki_document', sourceId: s.sourceId, generationId: s.generationId})
WHERE c.embeddingSpace = $fingerprint
WITH c, vector.similarity.cosine(c.embedding, $vector) AS score
ORDER BY score DESC, c.id
LIMIT toInteger($candidateLimit)
RETURN c.sourceId AS sourceId, c.generationId AS generationId, c.chunkIndex AS chunkIndex, c.text AS text, score
`;

export const SEARCH_SEMANTIC_APPROXIMATE = `
CALL db.index.vector.queryNodes($indexName, toInteger($k), $vector) YIELD node, score
WHERE node.organizationId = $organizationId AND node.sourceKind = 'wiki_document'
  AND node.embeddingSpace = $fingerprint
RETURN node.sourceId AS sourceId, node.generationId AS generationId, node.chunkIndex AS chunkIndex, node.text AS text, score
`;

export const SHOW_SEMANTIC_VECTOR_INDEX = `
SHOW VECTOR INDEXES YIELD name, state, options
WHERE name = $indexName
RETURN state, options.indexConfig['vector.dimensions'] AS dimension
`;
