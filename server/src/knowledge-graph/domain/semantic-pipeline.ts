import { createHash } from 'node:crypto';

import { SYSTEM_PROMPT } from '@repo/knowledge-graph';
import { digestGraphJson } from '@/knowledge-graph/domain/graph-json-digest';

export const semanticOntology = {
  version: 1,
  allowedNodes: [
    'Person',
    'Team',
    'Project',
    'Technology',
    'Concept',
    'Decision',
    'Task',
    'Event',
  ],
  allowedRelationships: [
    'RELATED_TO',
    'PART_OF',
    'USES',
    'DEPENDS_ON',
    'RESPONSIBLE_FOR',
    'PARTICIPATES_IN',
    'DECIDES',
    'AFFECTS',
  ],
  strictMode: true,
  nodeProperties: [],
  relationshipProperties: [],
} as const;

export const semanticChunker = {
  splitter: 'langchain-recursive-markdown',
  packageVersion: '1.0.2',
  chunkSize: 2000,
  chunkOverlap: 200,
  normalization: 'nfc-lf-trim-v1',
  maxChunks: 48,
  maxChars: 120_000,
} as const;

export const semanticPipelineDescriptor = {
  storageVersion: 1,
  extractor: {
    provider: 'ollama-cloud',
    model: 'gpt-oss:120b',
    transformer: 'tool-calling',
    maxToolCallRetries: 1,
    promptDigest: createHash('sha256').update(SYSTEM_PROMPT).digest('hex'),
    temperature: 0,
  },
  ontology: semanticOntology,
  chunker: semanticChunker,
  embedding: {
    provider: 'gemini',
    model: 'gemini-embedding-2',
    dimensions: 768,
    maxInputBytes: 8000,
    similarity: 'cosine',
    documentFormat: 'title-text-v1',
    queryFormat: 'search-result-v1',
  },
} as const;

export const semanticPipelineFingerprint = digestGraphJson(
  semanticPipelineDescriptor,
);
export const semanticExtractorFingerprint = digestGraphJson({
  extractor: semanticPipelineDescriptor.extractor,
  ontology: semanticPipelineDescriptor.ontology,
});
