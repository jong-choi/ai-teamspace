import { randomUUID } from 'node:crypto';

import { KnowledgeGraphCorrectionTargetAmbiguousError } from '@/knowledge-graph/domain/graph-command.error';
import { encodeGraphNodeId } from '@/knowledge-graph/domain/graph-identity';
import { KnowledgeGraphViewChangedError } from '@/knowledge-graph/domain/graph-read.error';
import { GraphCorrectionCommandService } from '@/knowledge-graph/graph-correction-command.service';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';
import { SemanticGraphExtractor } from '@/knowledge-graph/infrastructure/extraction/semantic-graph-extractor.provider';

import {
  createRunPrefix,
  KnowledgeGraphHttpFixture,
} from '@test/knowledge-graph/support/knowledge-graph-http.fixture';

const describeGraphCommandsE2e =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p8_a4'
    ? describe
    : describe.skip;

describeGraphCommandsE2e('H8 지식 그래프 명령 HTTP', () => {
  const prefix = createRunPrefix('a4-commands');
  const correctionId = '77777777-7777-4777-8777-777777777777';
  const replacementId = '88888888-8888-4888-8888-888888888888';
  const sourceId = '99999999-9999-4999-8999-999999999999';
  const generationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const semanticKey = 'b'.repeat(64);
  const semanticNodeId = encodeGraphNodeId([
    1,
    'e',
    'wiki_document',
    sourceId,
    generationId,
    semanticKey,
  ]);
  const correctionAnchor = {
    v: 1 as const,
    entityType: 'Person' as const,
    normalizedName: '지윤',
    evidenceDigest: 'c'.repeat(64),
    occurrence: 1,
    extractorFingerprint: 'd'.repeat(64),
  };
  const embedderMock = {
    embedDocuments: jest.fn(async () => []),
    embedQuery: jest.fn(async () => []),
    asLangchainEmbeddings: jest.fn(() => ({
      embedDocuments: async () => [],
      embedQuery: async () => [],
    })),
  };
  const extractorMock = { extract: jest.fn() };
  const correctionMock = {
    create: jest.fn(async () => ({
      correctionId,
      linkedCorrectionId: null,
      action: 'label_override' as const,
      editRevision: 1,
      matchState: 'matched' as const,
    })),
    list: jest.fn(async () => ({
      editRevision: 1,
      items: [
        {
          id: correctionId,
          linkedCorrectionId: null,
          targetKind: 'entity' as const,
          action: 'label_override' as const,
          anchor: correctionAnchor,
          value: { label: '지윤님' },
          createdRevision: 1,
          lastMatchState: 'matched' as const,
          lastMatchedGenerationId: generationId,
          createdAt: '2026-10-09T00:00:00.000Z',
        },
      ],
    })),
    update: jest.fn(async () => ({
      correctionId: replacementId,
      linkedCorrectionId: null,
      action: 'label_override' as const,
      editRevision: 2,
      matchState: 'matched' as const,
    })),
    delete: jest.fn(async () => undefined),
  };

  let fixture: KnowledgeGraphHttpFixture;
  let owner: Awaited<ReturnType<KnowledgeGraphHttpFixture['createUser']>>;
  let member: Awaited<ReturnType<KnowledgeGraphHttpFixture['createUser']>>;
  let organizationId: string;

  beforeAll(async () => {
    fixture = await KnowledgeGraphHttpFixture.boot(prefix, (builder) =>
      builder
        .overrideProvider(GraphCorrectionCommandService)
        .useValue(correctionMock)
        .overrideProvider(SemanticEmbedder)
        .useValue(embedderMock)
        .overrideProvider(SemanticGraphExtractor)
        .useValue(extractorMock),
    );
    owner = await fixture.createUser('owner');
    member = await fixture.createUser('member');
    organizationId = await fixture.createOrganization(owner, 'main');
    await fixture.addMember(organizationId, member.userId, 'member');
  });

  afterAll(async () => {
    await fixture?.close();
  });

  it('H8-08 curated CRUD는 201/200/204와 pending projection을 유지한다', async () => {
    const created = await owner.agent
      .post(path('curated/nodes'))
      .send({ kind: 'custom', title: 'A4 노드', properties: {} })
      .expect(201);

    expect(created.body).toMatchObject({
      kind: 'custom',
      title: 'A4 노드',
      revision: 1,
      projectionState: 'pending',
    });
    expect(typeof created.body.id).toBe('string');
    expect(created.body.updatedAt).toMatch(/Z$/);

    const updated = await owner.agent
      .patch(path(`curated/nodes/${created.body.id}`))
      .send({ title: 'A4 노드 수정', expectedRevision: 1 })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: created.body.id,
      title: 'A4 노드 수정',
      revision: 2,
      projectionState: 'pending',
    });

    const stale = await owner.agent
      .patch(path(`curated/nodes/${created.body.id}`))
      .send({ title: '오래된 수정', expectedRevision: 1 })
      .expect(409);
    expect(stale.body.errorCode).toBe('KG_CURATED_REVISION_CONFLICT');

    await owner.agent
      .delete(path(`curated/nodes/${created.body.id}`))
      .query({ expectedRevision: 2 })
      .expect(204);
  });

  it('H8-08 member는 curated write를 할 수 없다', async () => {
    const response = await member.agent
      .post(path('curated/nodes'))
      .send({ kind: 'custom', title: '금지 노드', properties: {} })
      .expect(403);

    expect(response.body.errorCode).toBe('KG_CURATED_WRITE_FORBIDDEN');
  });

  it('H8-08 edge는 종단 검증·중복·연결 node 삭제 불변식을 그대로 유지한다', async () => {
    const first = await owner.agent
      .post(path('curated/nodes'))
      .send({ kind: 'custom', title: '첫 노드', properties: {} })
      .expect(201);
    const second = await owner.agent
      .post(path('curated/nodes'))
      .send({ kind: 'custom', title: '둘째 노드', properties: {} })
      .expect(201);

    const invalid = await owner.agent
      .post(path('curated/edges'))
      .send({
        sourceNodeId: first.body.id,
        targetNodeId: randomUUID(),
        predicate: 'related_to',
      })
      .expect(400);
    expect(invalid.body.errorCode).toBe('KG_CURATED_ENDPOINT_INVALID');

    const edge = await owner.agent
      .post(path('curated/edges'))
      .send({
        sourceNodeId: first.body.id,
        targetNodeId: second.body.id,
        predicate: 'related_to',
      })
      .expect(201);
    expect(edge.body).toMatchObject({
      predicate: 'related_to',
      revision: 1,
      projectionState: 'pending',
    });

    const duplicate = await owner.agent
      .post(path('curated/edges'))
      .send({
        sourceNodeId: first.body.id,
        targetNodeId: second.body.id,
        predicate: 'related_to',
      })
      .expect(409);
    expect(duplicate.body.errorCode).toBe('KG_CURATED_EDGE_DUPLICATE');

    const connected = await owner.agent
      .delete(path(`curated/nodes/${first.body.id}`))
      .query({ expectedRevision: 1 })
      .expect(409);
    expect(connected.body.errorCode).toBe('KG_CURATED_NODE_CONNECTED');

    await owner.agent
      .delete(path(`curated/edges/${edge.body.id}`))
      .query({ expectedRevision: 1 })
      .expect(204);
    await owner.agent
      .delete(path(`curated/nodes/${first.body.id}`))
      .query({ expectedRevision: 1 })
      .expect(204);
    await owner.agent
      .delete(path(`curated/nodes/${second.body.id}`))
      .query({ expectedRevision: 1 })
      .expect(204);
  });

  it('H8-08 endpoint-options는 현재 조직 원본만 UUID와 허용 predicate로 돌려준다', async () => {
    const document = await fixture.createWikiDocument(owner, organizationId, {
      title: 'A4 후보 문서',
      contentMarkdown: 'endpoint 후보',
    });
    const foreignOrganizationId = await fixture.createOrganization(
      owner,
      'foreign',
    );
    const foreign = await fixture.createWikiDocument(
      owner,
      foreignOrganizationId,
      {
        title: '외부 조직 문서',
        contentMarkdown: '보이면 안 됨',
      },
    );

    const response = await owner.agent
      .get(path('curated/endpoint-options'))
      .query({ kind: 'wiki_document', q: '문서', limit: 20 })
      .expect(200);

    expect(response.body.items).toEqual(
      expect.arrayContaining([
        {
          nodeId: document.id,
          kind: 'wiki_document',
          title: 'A4 후보 문서',
          allowedPredicates: ['references'],
        },
      ]),
    );
    expect(
      response.body.items.some(
        (item: { nodeId: string }) => item.nodeId === foreign.id,
      ),
    ).toBe(false);
  });

  it('H8-09 authoritative node의 PATCH/DELETE는 404이고 원본을 바꾸지 않는다', async () => {
    const document = await fixture.createWikiDocument(owner, organizationId, {
      title: 'H8-09 권위 원본',
      contentMarkdown: '그래프 명령으로 수정되면 안 된다.',
    });
    const authoritativeNodeId = encodeGraphNodeId([
      1,
      's',
      'wiki_document',
      document.id,
    ]);

    await owner.agent
      .patch(path(`nodes/${authoritativeNodeId}`))
      .send({ title: '변경 시도' })
      .expect(404);
    await owner.agent.delete(path(`nodes/${authoritativeNodeId}`)).expect(404);

    const unchanged = await owner.agent
      .get(`/organizations/${organizationId}/wiki/documents/${document.id}`)
      .expect(200);
    expect(unchanged.body).toMatchObject({
      id: document.id,
      title: 'H8-09 권위 원본',
    });
  });

  it('H8-10 correction POST/PATCH/GET/DELETE HTTP 계약과 strict 입력을 노출한다', async () => {
    const created = await owner.agent
      .post(path('corrections'))
      .send({
        action: 'label_override',
        nodeId: semanticNodeId,
        value: { label: '지윤님' },
      })
      .expect(201);
    expect(created.body).toEqual({
      correctionId,
      linkedCorrectionId: null,
      action: 'label_override',
      editRevision: 1,
      matchState: 'matched',
    });

    await owner.agent
      .post(path('corrections'))
      .send({
        action: 'label_override',
        nodeId: semanticNodeId,
        value: { label: '지윤님' },
        extra: true,
      })
      .expect(400);

    const list = await owner.agent
      .get(path('corrections'))
      .query({ sourceId })
      .expect(200);
    expect(list.body).toMatchObject({
      editRevision: 1,
      items: [
        {
          id: correctionId,
          lastMatchState: 'matched',
          lastMatchedGenerationId: generationId,
        },
      ],
    });

    const replaced = await owner.agent
      .patch(path(`corrections/${correctionId}`))
      .send({ value: { label: '새 이름' } })
      .expect(200);
    expect(replaced.body).toMatchObject({
      correctionId: replacementId,
      editRevision: 2,
      matchState: 'matched',
    });

    await owner.agent.delete(path(`corrections/${replacementId}`)).expect(204);

    correctionMock.create.mockRejectedValueOnce(
      new KnowledgeGraphViewChangedError(),
    );
    const viewChanged = await owner.agent
      .post(path('corrections'))
      .send({
        action: 'label_override',
        nodeId: semanticNodeId,
        value: { label: 'stale generation' },
      })
      .expect(409);
    expect(viewChanged.body.errorCode).toBe('KG_GRAPH_VIEW_CHANGED');

    correctionMock.create.mockRejectedValueOnce(
      new KnowledgeGraphCorrectionTargetAmbiguousError(),
    );
    const ambiguous = await owner.agent
      .post(path('corrections'))
      .send({ action: 'suppress', nodeId: semanticNodeId })
      .expect(409);
    expect(ambiguous.body.errorCode).toBe('KG_CORRECTION_TARGET_AMBIGUOUS');

    expect(correctionMock.create).toHaveBeenCalledTimes(3);
    expect(correctionMock.list).toHaveBeenCalledTimes(1);
    expect(correctionMock.update).toHaveBeenCalledTimes(1);
    expect(correctionMock.delete).toHaveBeenCalledTimes(1);
    expect(embedderMock.embedDocuments).not.toHaveBeenCalled();
    expect(embedderMock.embedQuery).not.toHaveBeenCalled();
    expect(extractorMock.extract).not.toHaveBeenCalled();
  });

  function path(suffix: string) {
    return `/organizations/${organizationId}/knowledge-graph/${suffix}`;
  }
});
