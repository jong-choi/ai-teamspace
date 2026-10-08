import { Document } from '@langchain/core/documents';
import { RunnableLambda } from '@langchain/core/runnables';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { GraphDocument } from '@langchain/neo4j';

import { LLMGraphTransformer } from '#knowledge-graph/llm-graph-transformer.js';

function fakeStructuredModel(graph: object) {
  const model = new FakeListChatModel({ responses: ['사용하지 않는 응답'] });
  Object.defineProperty(model, 'withStructuredOutput', {
    value: () => RunnableLambda.from(async () => graph),
  });
  return model;
}

describe('MIT 원본 그래프 추출기', () => {
  it('구조화 출력에서 노드와 관계 및 원본 출처를 보존한다', async () => {
    const model = fakeStructuredModel({
      nodes: [
        { id: '민수', type: 'Person' },
        { id: 'Better Auth', type: 'Technology' },
      ],
      relationships: [
        {
          sourceNodeId: '민수',
          sourceNodeType: 'Person',
          targetNodeId: 'Better Auth',
          targetNodeType: 'Technology',
          relationshipType: 'Uses',
        },
      ],
    });
    const transformer = new LLMGraphTransformer({
      llm: model,
      allowedNodes: ['Person', 'Technology'],
      allowedRelationships: ['USES'],
    });
    const document = new Document({
      pageContent: '민수는 Better Auth를 사용한다.',
      metadata: { id: '문서-1' },
    });
    const [graph] = await transformer.convertToGraphDocuments([document]);
    expect(graph).toBeInstanceOf(GraphDocument);
    expect(graph.source).toBe(document);
    expect(graph.nodes.map((node) => node.id)).toEqual(['민수', 'Better Auth']);
    expect(graph.relationships.map((relation) => relation.type)).toEqual([
      'USES',
    ]);
  });

  it('허용하지 않은 노드 및 관계 타입을 걸러낸다', async () => {
    const model = fakeStructuredModel({
      nodes: [
        { id: '민수', type: 'Person' },
        { id: '서울', type: 'City' },
      ],
      relationships: [
        {
          sourceNodeId: '민수',
          sourceNodeType: 'Person',
          targetNodeId: '서울',
          targetNodeType: 'City',
          relationshipType: 'LIVES_IN',
        },
      ],
    });
    const transformer = new LLMGraphTransformer({
      llm: model,
      allowedNodes: ['Person'],
      allowedRelationships: ['USES'],
    });
    const graph = await transformer.processResponse(
      new Document({ pageContent: '민수는 서울에 산다.' }),
    );
    expect(graph.nodes).toHaveLength(1);
    expect(graph.relationships).toHaveLength(0);
  });

  it('빈 문서 배열은 빈 결과로 처리한다', async () => {
    const transformer = new LLMGraphTransformer({
      llm: fakeStructuredModel({ nodes: [], relationships: [] }),
    });
    await expect(transformer.convertToGraphDocuments([])).resolves.toEqual([]);
  });
});
