import { Document } from '@langchain/core/documents';
import { AIMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { FakeListChatModel } from '@langchain/core/utils/testing';

import { createToolCallingGraphTransformer } from '#knowledge-graph/tool-calling-structured-output.adapter.js';

function messageWithGraph(args: Record<string, unknown>) {
  return new AIMessage({
    content: '',
    tool_calls: [{ id: '호출-1', name: 'extract_graph', args }],
  });
}

function fakeToolCallingModel(messages: AIMessage[]) {
  const model = new FakeListChatModel({ responses: ['사용하지 않는 응답'] });
  let invocations = 0;
  const toolsBound: unknown[] = [];
  Object.defineProperty(model, 'bindTools', {
    value: (tools: unknown[]) => {
      toolsBound.push(...tools);
      return RunnableLambda.from(async () => {
        const message = messages[Math.min(invocations, messages.length - 1)];
        invocations += 1;
        return message;
      });
    },
  });
  return { model, toolsBound, getInvocations: () => invocations };
}

const validGraph = {
  nodes: [
    { id: '지윤', type: 'Person' },
    { id: 'Neo4j', type: 'Technology' },
  ],
  relationships: [
    {
      sourceNodeId: '지윤',
      sourceNodeType: 'Person',
      targetNodeId: 'Neo4j',
      targetNodeType: 'Technology',
      relationshipType: 'USES',
    },
  ],
};

describe('Structured Output 미지원 모델의 Tool Calling 어댑터', () => {
  it('별도 Tool Calling으로 받은 그래프를 기존 변환기로 처리한다', async () => {
    const fake = fakeToolCallingModel([messageWithGraph(validGraph)]);
    const transformer = createToolCallingGraphTransformer({
      llm: fake.model,
      allowedNodes: ['Person', 'Technology'],
      allowedRelationships: ['USES'],
    });
    const document = new Document({
      pageContent: '지윤은 Neo4j를 사용한다.',
      metadata: { id: '문서-1' },
    });

    const [graph] = await transformer.convertToGraphDocuments([document]);

    expect(graph.source).toBe(document);
    expect(graph.nodes.map((node) => node.id)).toEqual(['지윤', 'Neo4j']);
    expect(graph.relationships.map((relation) => relation.type)).toEqual([
      'USES',
    ]);
    expect(fake.getInvocations()).toBe(1);
    expect(fake.toolsBound).toHaveLength(1);
    expect(fake.toolsBound[0]).toMatchObject({
      type: 'function',
      function: {
        name: 'extract_graph',
        parameters: {
          type: 'object',
          required: ['nodes', 'relationships'],
        },
      },
    });
  });

  it('스키마가 틀린 도구 인수를 거부하고 한 번 재시도한다', async () => {
    const fake = fakeToolCallingModel([
      messageWithGraph({ nodes: validGraph.nodes }),
      messageWithGraph(validGraph),
    ]);
    const transformer = createToolCallingGraphTransformer({ llm: fake.model });
    const graph = await transformer.processResponse(
      new Document({ pageContent: '지윤은 Neo4j를 사용한다.' }),
    );

    expect(graph.relationships).toHaveLength(1);
    expect(fake.getInvocations()).toBe(2);
  });

  it('도구를 호출하지 않고 일반 텍스트를 반환하면 오류를 던진다', async () => {
    const fake = fakeToolCallingModel([
      new AIMessage({ content: '{"nodes":[],"relationships":[]}' }),
    ]);
    const transformer = createToolCallingGraphTransformer({ llm: fake.model });

    await expect(
      transformer.processResponse(new Document({ pageContent: '입력' })),
    ).rejects.toThrow('extract_graph 도구를 정확히 한 번 호출해야 합니다.');
    expect(fake.getInvocations()).toBe(2);
  });

  it('유효한 도구 인수가 끝까지 없으면 빈 그래프로 취급하지 않는다', async () => {
    const fake = fakeToolCallingModel([messageWithGraph({ nodes: [] })]);
    const transformer = createToolCallingGraphTransformer({
      llm: fake.model,
      maxToolCallRetries: 0,
    });
    await expect(
      transformer.processResponse(new Document({ pageContent: '입력' })),
    ).rejects.toThrow('그래프 스키마를 통과하지 못했습니다.');
    expect(fake.getInvocations()).toBe(1);
  });

  it('도구 호출을 지원하지 않는 채팅 모델은 생성할 때 거부한다', () => {
    const model = new FakeListChatModel({ responses: ['일반 응답'] });
    Object.defineProperty(model, 'bindTools', { value: undefined });
    expect(() => createToolCallingGraphTransformer({ llm: model })).toThrow(
      'Tool Calling(bindTools)을 지원하지 않습니다.',
    );
  });

  it('잘못된 재시도 횟수를 거부한다', () => {
    const fake = fakeToolCallingModel([messageWithGraph(validGraph)]);
    expect(() =>
      createToolCallingGraphTransformer({
        llm: fake.model,
        maxToolCallRetries: -1,
      }),
    ).toThrow('재시도 횟수');
  });
  it('동시에 여러 도구를 호출하면 결과를 임의로 선택하지 않는다', async () => {
    const fake = fakeToolCallingModel([
      new AIMessage({
        content: '',
        tool_calls: [
          { id: '첫번째', name: 'extract_graph', args: validGraph },
          { id: '두번째', name: 'extract_graph', args: validGraph },
        ],
      }),
    ]);
    const transformer = createToolCallingGraphTransformer({
      llm: fake.model,
      maxToolCallRetries: 0,
    });

    await expect(
      transformer.processResponse(new Document({ pageContent: '입력' })),
    ).rejects.toThrow('extract_graph 도구를 정확히 한 번 호출해야 합니다.');
  });

  it('허용되지 않은 노드 타입은 스키마 검증에서 거부한다', async () => {
    const fake = fakeToolCallingModel([
      messageWithGraph({
        nodes: [{ id: '지윤', type: 'City' }],
        relationships: [],
      }),
    ]);
    const transformer = createToolCallingGraphTransformer({
      llm: fake.model,
      allowedNodes: ['Person'],
      maxToolCallRetries: 0,
    });
    await expect(
      transformer.processResponse(new Document({ pageContent: '지윤' })),
    ).rejects.toThrow('그래프 스키마를 통과하지 못했습니다.');
  });
});
