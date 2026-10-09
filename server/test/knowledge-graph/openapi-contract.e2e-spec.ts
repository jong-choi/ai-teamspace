import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createOpenApiDocument } from '@/openapi';

import { KnowledgeGraphHttpFixture } from '@test/knowledge-graph/support/knowledge-graph-http.fixture';
import { z } from 'zod';

const OperationSchema = z
  .object({
    operationId: z.string(),
    responses: z.record(z.string(), z.unknown()),
  })
  .passthrough();
const PathSchema = z
  .object({
    get: OperationSchema.optional(),
    post: OperationSchema.optional(),
    patch: OperationSchema.optional(),
    delete: OperationSchema.optional(),
  })
  .passthrough();

describeKnowledgeGraph('H8-20 지식 그래프 OpenAPI 계약', () => {
  let fixture: KnowledgeGraphHttpFixture;

  beforeAll(async () => {
    fixture = await KnowledgeGraphHttpFixture.boot('openapi-contract');
  });

  afterAll(async () => {
    await fixture?.close();
  });

  it('route operationId와 refresh 202·ProblemDetails 응답을 고정한다', () => {
    const document = createOpenApiDocument(fixture.app);
    const operations = Object.values(document.paths).flatMap((path) => {
      const parsed = PathSchema.parse(path);
      return [parsed.get, parsed.post, parsed.patch, parsed.delete].flatMap(
        (operation) => (operation ? [operation.operationId] : []),
      );
    });
    expect(operations).toEqual(
      expect.arrayContaining([
        'WikiKnowledgeGraphController_refresh',
        'WikiKnowledgeGraphController_status',
        'KnowledgeGraphSearchController_search',
        'KnowledgeGraphController_explore',
        'KnowledgeGraphController_listNodes',
        'KnowledgeGraphController_listEdges',
        'KnowledgeGraphController_nodeDetail',
        'KnowledgeGraphController_edgeDetail',
        'KnowledgeGraphCommandController_createCuratedNode',
        'KnowledgeGraphCommandController_createCuratedEdge',
        'KnowledgeGraphCommandController_createCorrection',
        'KnowledgeGraphOperationsController_request',
        'KnowledgeGraphOperationsController_status',
      ]),
    );

    const refresh = PathSchema.parse(
      document.paths[
        '/organizations/{organizationId}/wiki/documents/{documentId}/knowledge-graph/refresh'
      ],
    ).post;
    expect(refresh?.responses).toHaveProperty('202');
    for (const status of ['429', '503']) {
      const response = JSON.stringify(refresh?.responses[status]);
      expect(response).toContain('#/components/schemas/ProblemDetails');
    }
    const curatedUpdate = PathSchema.parse(
      document.paths[
        '/organizations/{organizationId}/knowledge-graph/curated/nodes/{nodeId}'
      ],
    ).patch;
    expect(JSON.stringify(curatedUpdate?.responses['409'])).toContain(
      '#/components/schemas/ProblemDetails',
    );

    const explore = JSON.stringify(
      document.paths['/organizations/{organizationId}/knowledge-graph/explore'],
    );
    for (const parameter of [
      'focusKind',
      'focusId',
      'q',
      'depth',
      'limit',
      'cursor',
    ]) {
      expect(explore).toContain(`"name":"${parameter}"`);
    }
    const nodeList = JSON.stringify(
      document.paths['/organizations/{organizationId}/knowledge-graph/nodes'],
    );
    expect(nodeList).toContain('"name":"kind"');
    expect(nodeList).toContain('"name":"q"');
    const edgeList = JSON.stringify(
      document.paths['/organizations/{organizationId}/knowledge-graph/edges'],
    );
    expect(edgeList).toContain('"name":"relation"');
  });

  it('status 8종·nullable·ISO와 editTarget union·opaque ID를 생성한다', () => {
    const schemas = fixture.app
      ? createOpenApiDocument(fixture.app).components?.schemas
      : undefined;
    const status = JSON.stringify(schemas?.WikiKnowledgeGraphStatus);
    expect(status).toContain('graphNodeId');
    for (const value of [
      'accepted',
      'queued',
      'running',
      'waiting',
      'stale',
      'not_indexed',
      'up_to_date',
      'failed',
    ]) {
      expect(status).toContain(value);
    }
    expect(status).toContain('date-time');
    expect(status).toContain('nullable');

    const editTarget = JSON.stringify(schemas?.GraphEditTarget);
    expect(editTarget).toContain('oneOf');
    for (const kind of [
      'none',
      'owner',
      'curated_node',
      'curated_edge',
      'semantic_correction',
    ]) {
      expect(editTarget).toContain(kind);
    }
    const graphNode = JSON.stringify(schemas?.GraphNode);
    expect(graphNode).toContain('maxLength');
    expect(graphNode).toContain('curated');
    expect(graphNode).not.toContain('"id":{"type":"string","format":"uuid"');
    expect(JSON.stringify(schemas?.GraphEdge)).toContain('curated');
  });
});
