import { createHash, randomUUID } from 'node:crypto';

import type { KnowledgeGraphSeed, Workspace } from '#seed/source.ts';

import {
  auth,
  driver,
  type Driver,
  type ManagedTransaction,
} from 'neo4j-driver';
import pg from 'pg';

export type KnowledgeGraphSeedTarget = {
  documentId: string;
  documentKey: string;
  organizationId: string;
  organizationSlug: string;
};

type WikiSnapshot = {
  contentMarkdown: string;
  id: string;
  organizationId: string;
  parentDocumentId: string | null;
  position: number;
  title: string;
  updatedAt: Date;
};

type SemanticNode = KnowledgeGraphSeed['extractions'][number]['nodes'][number];
type SemanticRelationship =
  KnowledgeGraphSeed['extractions'][number]['relationships'][number];

type SeedInput = {
  databaseUrl: string;
  graph: KnowledgeGraphSeed;
  neo4j: {
    database: string;
    password: string;
    uri: string;
    username: string;
  };
  targets: readonly KnowledgeGraphSeedTarget[];
};

type NormalizedEntity = {
  chunkKey: string;
  chunkIndex: number;
  entityType: SemanticNode['type'];
  evidenceDigest: string;
  extractorFingerprint: string;
  key: string;
  localId: string;
  normalizedName: string;
  occurrence: number;
  v: 1;
};

type NormalizedRelationship = {
  chunkIndex: number;
  key: string;
  predicate: SemanticRelationship['relationshipType'];
  sourceKey: string;
  targetKey: string;
};

const semanticInitialization = [
  'CREATE CONSTRAINT kg_semantic_chunk_key IF NOT EXISTS FOR (c:KGSemanticChunk) REQUIRE c.id IS UNIQUE',
  'CREATE CONSTRAINT kg_semantic_entity_key IF NOT EXISTS FOR (e:KGSemanticEntity) REQUIRE e.key IS UNIQUE',
  'CREATE INDEX kg_semantic_chunk_scope IF NOT EXISTS FOR (c:KGSemanticChunk) ON (c.organizationId, c.sourceKind, c.sourceId, c.generationId)',
  'CREATE INDEX kg_semantic_entity_scope IF NOT EXISTS FOR (e:KGSemanticEntity) ON (e.organizationId, e.sourceKind, e.sourceId, e.generationId)',
  'CREATE VECTOR INDEX kg_semantic_chunk_embedding_v1 IF NOT EXISTS FOR (c:KGSemanticChunk) ON c.embedding OPTIONS { indexConfig: { `vector.dimensions`: 768, `vector.similarity_function`: "cosine" } }',
] as const;

const createChunk = `
CREATE (c:KGSemanticChunk {id: $id})
WITH c
CALL db.create.setVectorProperty(c, 'embedding', $embedding)
YIELD node
SET c.text = $text
SET c += $metadata
RETURN count(c) AS written`;

const createEntities = `
UNWIND $entities AS row
MATCH (c:KGSemanticChunk {id: row.chunkKey})
CREATE (e:KGSemanticEntity {key: row.key})
SET e.organizationId=$organizationId, e.sourceKind='wiki_document', e.sourceId=$sourceId,
 e.generationId=$generationId, e.chunkIndex=row.chunkIndex, e.localId=row.localId,
 e.entityType=row.entityType, e.normalizedName=row.normalizedName, e.evidenceDigest=row.evidenceDigest,
 e.occurrence=row.occurrence, e.extractorFingerprint=row.extractorFingerprint, e.factClass='extracted',
 e.embeddingSpace=$fingerprint, e.createdAt=$createdAt
CREATE (c)-[:KG_SEMANTIC_MENTIONS]->(e)
RETURN count(e) AS written`;

const createRelationships = `
UNWIND $relationships AS row
MATCH (s:KGSemanticEntity {key: row.sourceKey}), (t:KGSemanticEntity {key: row.targetKey})
CREATE (s)-[r:KG_SEMANTIC_RELATION {key: row.key}]->(t)
SET r.predicate=row.predicate, r.organizationId=$organizationId, r.sourceKind='wiki_document',
 r.sourceId=$sourceId, r.generationId=$generationId, r.chunkIndex=row.chunkIndex, r.factClass='extracted'
RETURN count(r) AS written`;

function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson(Reflect.get(value, key))}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeSemanticText(value: string): string {
  return value.normalize('NFC').replace(/\r\n?/g, '\n').trimEnd();
}

function sourceSignature(snapshot: WikiSnapshot): string {
  return digest({
    v: 1,
    title: snapshot.title,
    parentDocumentId: snapshot.parentDocumentId,
    position: snapshot.position,
    contentMarkdown: normalizeSemanticText(snapshot.contentMarkdown),
  });
}

function documentKey(input: {
  document: string;
  organization: string;
}): string {
  return `${input.organization}/${input.document}`;
}

function recordCount(value: unknown): number {
  if (
    value &&
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof value.toNumber === 'function'
  ) {
    return value.toNumber();
  }
  return Number(value);
}

export function validateKnowledgeGraphSeed(
  graph: KnowledgeGraphSeed,
  targets: readonly KnowledgeGraphSeedTarget[],
): void {
  const expected = new Set(
    targets.map((target) =>
      documentKey({
        organization: target.organizationSlug,
        document: target.documentKey,
      }),
    ),
  );
  if (expected.size !== targets.length)
    throw new Error('중복된 지식 그래프 시드 대상이 있습니다.');

  const extractionKeys = graph.extractions.map(documentKey);
  const embeddingKeys = graph.embeddings.map(documentKey);
  for (const key of expected) {
    if (extractionKeys.filter((candidate) => candidate === key).length !== 1)
      throw new Error(`추출 시드는 문서마다 정확히 하나여야 합니다: ${key}`);
    if (embeddingKeys.filter((candidate) => candidate === key).length !== 1)
      throw new Error(
        `임베딩 시드는 문서마다 정확히 한 청크여야 합니다: ${key}`,
      );
  }
  for (const key of [...extractionKeys, ...embeddingKeys]) {
    if (!expected.has(key))
      throw new Error(`위키 문서 목록에 없는 지식 그래프 시드입니다: ${key}`);
  }

  const globalTypes = new Map<string, SemanticNode['type']>();
  for (const extraction of graph.extractions) {
    const key = documentKey(extraction);
    const local = new Map<string, SemanticNode['type']>();
    for (const node of extraction.nodes) {
      if (local.has(node.id))
        throw new Error(`중복 노드입니다: ${key}/${node.id}`);
      local.set(node.id, node.type);
      const globalType = globalTypes.get(node.id);
      if (globalType && globalType !== node.type)
        throw new Error(
          `문서 사이 노드 타입이 다릅니다: ${node.id} (${globalType}/${node.type})`,
        );
      globalTypes.set(node.id, node.type);
    }
    const relationships = new Set<string>();
    for (const relationship of extraction.relationships) {
      if (local.get(relationship.sourceNodeId) !== relationship.sourceNodeType)
        throw new Error(`관계 source가 노드와 다릅니다: ${key}`);
      if (local.get(relationship.targetNodeId) !== relationship.targetNodeType)
        throw new Error(`관계 target이 노드와 다릅니다: ${key}`);
      const identity = stableJson(relationship);
      if (relationships.has(identity))
        throw new Error(`중복 관계입니다: ${key}/${identity}`);
      relationships.add(identity);
    }
  }

  for (const embedding of graph.embeddings) {
    if (embedding.chunkIndex !== 0)
      throw new Error(
        `현재 extraction 형식은 문서당 한 청크만 지원합니다: ${documentKey(embedding)}`,
      );
    if (
      embedding.vector.some((value) => !Number.isFinite(value)) ||
      embedding.vector.every((value) => value === 0)
    ) {
      throw new Error(`유효하지 않은 임베딩입니다: ${documentKey(embedding)}`);
    }
  }
}

async function readSnapshots(
  client: pg.Client,
  targets: readonly KnowledgeGraphSeedTarget[],
): Promise<Map<string, WikiSnapshot>> {
  const result = await client.query<{
    content_markdown: string;
    id: string;
    organization_id: string;
    parent_document_id: string | null;
    position: number;
    title: string;
    updated_at: Date;
  }>(
    `select id, organization_id, parent_document_id, title, position,
            content_markdown, updated_at
       from wiki_document
      where id = any($1::uuid[])`,
    [targets.map((target) => target.documentId)],
  );
  const snapshots = new Map<string, WikiSnapshot>();
  for (const row of result.rows) {
    snapshots.set(row.id, {
      id: row.id,
      organizationId: row.organization_id,
      parentDocumentId: row.parent_document_id,
      title: row.title,
      position: row.position,
      contentMarkdown: row.content_markdown,
      updatedAt: row.updated_at,
    });
  }
  if (snapshots.size !== targets.length)
    throw new Error(
      `위키 문서 조회 개수가 다릅니다: ${snapshots.size}/${targets.length}`,
    );
  return snapshots;
}

function normalizeGraph(input: {
  chunk: string;
  chunkKey: string;
  chunkIndex: number;
  extraction: KnowledgeGraphSeed['extractions'][number];
  extractorFingerprint: string;
  generationId: string;
  organizationId: string;
  signature: string;
  sourceId: string;
}): {
  entities: NormalizedEntity[];
  relationships: NormalizedRelationship[];
} {
  const normalizedText = normalizeSemanticText(input.chunk).normalize('NFKC');
  const loweredText = normalizedText.toLocaleLowerCase('ko');
  const sentences = normalizedText.split(/(?<=[.!?。])\s+|\n/);
  const occurrences = new Map<string, number>();
  const entities: NormalizedEntity[] = [];
  const entityByIdentity = new Map<string, NormalizedEntity>();

  for (const node of input.extraction.nodes) {
    const localId = node.id.normalize('NFKC').trim();
    const normalizedName = localId.replace(/\s+/g, ' ').toLocaleLowerCase('ko');
    const sentence = loweredText.includes(normalizedName)
      ? (sentences.find((value) =>
          value.toLocaleLowerCase('ko').includes(normalizedName),
        ) ?? null)
      : null;
    const occurrenceKey = stableJson([node.type, normalizedName]);
    const occurrence = sentence ? (occurrences.get(occurrenceKey) ?? 0) + 1 : 1;
    if (sentence) occurrences.set(occurrenceKey, occurrence);
    const entity: NormalizedEntity = {
      v: 1,
      localId,
      entityType: node.type,
      normalizedName,
      evidenceDigest: sentence
        ? hashText(sentence.trim())
        : hashText(`chunk:${hashText(normalizeSemanticText(input.chunk))}`),
      occurrence,
      extractorFingerprint: input.extractorFingerprint,
      chunkIndex: input.chunkIndex,
      chunkKey: input.chunkKey,
      key: digest([
        'kg-semantic-entity',
        input.organizationId,
        'wiki_document',
        input.sourceId,
        input.signature,
        input.generationId,
        input.chunkIndex,
        node.type,
        localId,
      ]),
    };
    entities.push(entity);
    entityByIdentity.set(stableJson([node.type, localId]), entity);
  }

  const relationships = input.extraction.relationships.map((relationship) => {
    const source = entityByIdentity.get(
      stableJson([
        relationship.sourceNodeType,
        relationship.sourceNodeId.normalize('NFKC').trim(),
      ]),
    );
    const target = entityByIdentity.get(
      stableJson([
        relationship.targetNodeType,
        relationship.targetNodeId.normalize('NFKC').trim(),
      ]),
    );
    if (!source || !target)
      throw new Error(
        `정규화할 수 없는 관계입니다: ${stableJson(relationship)}`,
      );
    return {
      key: digest([
        'kg-semantic-rel',
        source.key,
        relationship.relationshipType,
        target.key,
      ]),
      sourceKey: source.key,
      targetKey: target.key,
      predicate: relationship.relationshipType,
      chunkIndex: input.chunkIndex,
    };
  });
  return { entities, relationships };
}

async function writeNeo4jGeneration(
  graphDriver: Driver,
  database: string,
  input: {
    chunk: string;
    entities: readonly NormalizedEntity[];
    fingerprint: string;
    generationId: string;
    organizationId: string;
    relationships: readonly NormalizedRelationship[];
    signature: string;
    snapshot: WikiSnapshot;
    vector: readonly number[];
  },
): Promise<void> {
  const createdAt = new Date().toISOString();
  const chunk = input.entities[0]?.chunkKey;
  if (!chunk)
    throw new Error(
      `노드가 없는 문서는 시드할 수 없습니다: ${input.snapshot.id}`,
    );
  const parameters = {
    organizationId: input.organizationId,
    sourceId: input.snapshot.id,
    generationId: input.generationId,
    fingerprint: input.fingerprint,
    createdAt,
  };
  const session = graphDriver.session({ database });
  try {
    await session.executeWrite(async (transaction: ManagedTransaction) => {
      await transaction.run(
        `MATCH (n)
          WHERE (n:KGSemanticChunk OR n:KGSemanticEntity)
            AND n.organizationId=$organizationId AND n.sourceKind='wiki_document' AND n.sourceId=$sourceId
          DETACH DELETE n`,
        parameters,
      );
      const chunkResult = await transaction.run(createChunk, {
        id: chunk,
        embedding: [...input.vector],
        text: input.chunk,
        metadata: {
          ...parameters,
          chunkIndex: 0,
          sourceKind: 'wiki_document',
          sourceSignature: input.signature,
          sourceUpdatedAt: input.snapshot.updatedAt.toISOString(),
          embeddingSpace: input.fingerprint,
          textHash: hashText(normalizeSemanticText(input.chunk)),
          ontologyVersion: 1,
          factClass: 'extracted',
        },
      });
      if (recordCount(chunkResult.records[0]?.get('written')) !== 1)
        throw new Error(`청크 저장에 실패했습니다: ${input.snapshot.id}`);

      const entityResult = await transaction.run(createEntities, {
        ...parameters,
        entities: input.entities,
      });
      if (
        recordCount(entityResult.records[0]?.get('written')) !==
        input.entities.length
      ) {
        throw new Error(`노드 저장에 실패했습니다: ${input.snapshot.id}`);
      }
      const relationshipResult = await transaction.run(createRelationships, {
        ...parameters,
        relationships: input.relationships,
      });
      if (
        recordCount(relationshipResult.records[0]?.get('written')) !==
        input.relationships.length
      ) {
        throw new Error(`관계 저장에 실패했습니다: ${input.snapshot.id}`);
      }
    });
  } finally {
    await session.close();
  }
}

async function activatePostgresGeneration(
  client: pg.Client,
  input: {
    fingerprint: string;
    generationId: string;
    organizationId: string;
    signature: string;
    snapshot: WikiSnapshot;
  },
): Promise<void> {
  const result = await client.query(
    `insert into outbox_semantic_source_state (
       organization_id, aggregate_kind, aggregate_id,
       observed_seq, observed_at, indexed_seq, indexed_signature,
       indexed_source_updated_at, indexed_fingerprint, active_generation_id,
       last_indexed_at, run_status, attempt_seq, attempt_fingerprint,
       gc_required, updated_at
     )
     select v.organization_id, v.aggregate_kind, v.aggregate_id,
            v.desired_seq, clock_timestamp(), v.desired_seq, $3,
            $4, $5, $6, clock_timestamp(), 'idle', v.desired_seq, $5,
            false, now()
       from outbox_aggregate_version v
      where v.organization_id=$1 and v.aggregate_kind='wiki_document'
        and v.aggregate_id=$2 and v.deleted=false
     on conflict (organization_id, aggregate_kind, aggregate_id) do update set
       observed_seq=excluded.observed_seq,
       observed_at=excluded.observed_at,
       manual_delivered_seq=outbox_semantic_source_state.manual_request_seq,
       indexed_seq=excluded.indexed_seq,
       indexed_manual_seq=outbox_semantic_source_state.manual_request_seq,
       indexed_signature=excluded.indexed_signature,
       indexed_source_updated_at=excluded.indexed_source_updated_at,
       indexed_fingerprint=excluded.indexed_fingerprint,
       active_generation_id=excluded.active_generation_id,
       last_indexed_at=excluded.last_indexed_at,
       run_status='idle',
       attempt_seq=excluded.attempt_seq,
       attempt_manual_seq=outbox_semantic_source_state.manual_request_seq,
       attempt_fingerprint=excluded.attempt_fingerprint,
       lease_token=null,
       lease_expires_at=null,
       gc_required=false,
       last_error_code=null,
       retry_count=0,
       requeue_count=0,
       last_requeued_at=null,
       updated_at=now()
     returning aggregate_id`,
    [
      input.organizationId,
      input.snapshot.id,
      input.signature,
      input.snapshot.updatedAt,
      input.fingerprint,
      input.generationId,
    ],
  );
  if (result.rowCount !== 1)
    throw new Error(
      `위키 outbox 버전이 없어 의미 상태를 활성화하지 못했습니다: ${input.snapshot.id}`,
    );
}

async function initializeNeo4j(
  graphDriver: Driver,
  database: string,
): Promise<void> {
  const session = graphDriver.session({ database });
  try {
    for (const query of semanticInitialization) await session.run(query);
    await session.run('CALL db.awaitIndex($name, 30)', {
      name: 'kg_semantic_chunk_embedding_v1',
    });
  } finally {
    await session.close();
  }
}

export async function seedKnowledgeGraph(input: SeedInput): Promise<void> {
  validateKnowledgeGraphSeed(input.graph, input.targets);
  const client = new pg.Client({ connectionString: input.databaseUrl });
  const graphDriver = driver(
    input.neo4j.uri,
    auth.basic(input.neo4j.username, input.neo4j.password),
  );
  await client.connect();
  try {
    await graphDriver.verifyConnectivity({ database: input.neo4j.database });
    const snapshots = await readSnapshots(client, input.targets);
    await initializeNeo4j(graphDriver, input.neo4j.database);
    for (const target of input.targets) {
      const key = documentKey({
        organization: target.organizationSlug,
        document: target.documentKey,
      });
      const snapshot = snapshots.get(target.documentId);
      if (!snapshot || snapshot.organizationId !== target.organizationId)
        throw new Error(`위키 문서의 조직이 다릅니다: ${key}`);
      const extraction = input.graph.extractions.find(
        (row) => documentKey(row) === key,
      );
      const embedding = input.graph.embeddings.find(
        (row) => documentKey(row) === key,
      );
      if (!extraction || !embedding)
        throw new Error(`지식 그래프 시드를 찾지 못했습니다: ${key}`);
      if (normalizeSemanticText(snapshot.contentMarkdown) !== embedding.text)
        throw new Error(`위키 본문과 임베딩 청크가 다릅니다: ${key}`);

      const signature = sourceSignature(snapshot);
      const generationId = randomUUID();
      const chunkKey = digest([
        'kg-semantic-chunk',
        target.organizationId,
        'wiki_document',
        target.documentId,
        signature,
        generationId,
        embedding.chunkIndex,
      ]);
      const normalized = normalizeGraph({
        chunk: embedding.text,
        chunkKey,
        chunkIndex: embedding.chunkIndex,
        extraction,
        extractorFingerprint: input.graph.manifest.extractorFingerprint,
        generationId,
        organizationId: target.organizationId,
        signature,
        sourceId: target.documentId,
      });
      await writeNeo4jGeneration(graphDriver, input.neo4j.database, {
        chunk: embedding.text,
        entities: normalized.entities,
        fingerprint: input.graph.manifest.pipelineFingerprint,
        generationId,
        organizationId: target.organizationId,
        relationships: normalized.relationships,
        signature,
        snapshot,
        vector: embedding.vector,
      });
      await activatePostgresGeneration(client, {
        fingerprint: input.graph.manifest.pipelineFingerprint,
        generationId,
        organizationId: target.organizationId,
        signature,
        snapshot,
      });
      console.log(
        `의미 그래프 ${key}: 노드 ${normalized.entities.length}개, 관계 ${normalized.relationships.length}개`,
      );
    }
  } finally {
    await Promise.allSettled([client.end(), graphDriver.close()]);
  }
  console.log(`위키 의미 그래프 ${input.targets.length}개를 넣었습니다.`);
}

export async function resolveKnowledgeGraphTargets(
  databaseUrl: string,
  workspaces: readonly Workspace[],
): Promise<KnowledgeGraphSeedTarget[]> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{
      document_id: string;
      organization_id: string;
      slug: string;
      title: string;
    }>(
      `select o.id as organization_id, o.slug, w.id as document_id, w.title
         from organization o
         join wiki_document w on w.organization_id=o.id
        where o.slug = any($1::text[])`,
      [workspaces.map((workspace) => workspace.slug)],
    );
    const targets: KnowledgeGraphSeedTarget[] = [];
    for (const workspace of workspaces) {
      for (const document of workspace.wiki.documents) {
        const matches = result.rows.filter(
          (row) => row.slug === workspace.slug && row.title === document.title,
        );
        if (matches.length !== 1)
          throw new Error(
            `기존 위키 문서를 하나로 찾을 수 없습니다: ${workspace.slug}/${document.key}`,
          );
        const match = matches[0];
        if (!match)
          throw new Error('도달할 수 없는 위키 문서 조회 오류입니다.');
        targets.push({
          documentId: match.document_id,
          documentKey: document.key,
          organizationId: match.organization_id,
          organizationSlug: workspace.slug,
        });
      }
    }
    return targets;
  } finally {
    await client.end();
  }
}
