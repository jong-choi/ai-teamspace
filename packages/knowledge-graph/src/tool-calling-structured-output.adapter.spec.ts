import { Document } from '@langchain/core/documents';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { FakeListChatModel } from '@langchain/core/utils/testing';

import {
  createToolCallingGraphTransformer,
  ToolCallingGraphExtractionError,
} from '#knowledge-graph/tool-calling-structured-output.adapter.js';

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
  const inputs: BaseMessage[][] = [];
  Object.defineProperty(model, 'bindTools', {
    value: (tools: unknown[]) => {
      toolsBound.push(...tools);
      return RunnableLambda.from(async (input: BaseMessage[]) => {
        inputs.push([...input]);
        const message = messages[Math.min(invocations, messages.length - 1)];
        invocations += 1;
        return message;
      });
    },
  });
  return { model, toolsBound, inputs, getInvocations: () => invocations };
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

  it('재시도할 때 거절한 답과 검증 실패 이유를 대화에 붙여 보낸다', async () => {
    const rejected = messageWithGraph({
      nodes: [{ id: '지윤', label: 'person' }],
      relationships: [],
    });
    const fake = fakeToolCallingModel([rejected, messageWithGraph(validGraph)]);
    const transformer = createToolCallingGraphTransformer({
      llm: fake.model,
      allowedNodes: ['Person', 'Technology'],
      allowedRelationships: ['USES'],
    });

    await transformer.processResponse(
      new Document({ pageContent: '지윤은 Neo4j를 사용한다.' }),
    );

    const [first, second] = fake.inputs;
    const added = second.slice(first.length);
    expect(added[0]).toBe(rejected);
    expect(added[1].getType()).toBe('tool');
    expect(added[1]).toMatchObject({ tool_call_id: '호출-1', status: 'error' });
    expect(added[1].content).toContain('nodes.0.type');
  });

  it('도구를 호출하지 않은 답에는 사용자 메시지로 이유를 돌려준다', async () => {
    const fake = fakeToolCallingModel([
      new AIMessage({ content: '일반 텍스트' }),
      messageWithGraph(validGraph),
    ]);
    const transformer = createToolCallingGraphTransformer({ llm: fake.model });

    await transformer.processResponse(new Document({ pageContent: '입력' }));

    const [first, second] = fake.inputs;
    const added = second.slice(first.length);
    expect(added).toHaveLength(1);
    expect(added[0].getType()).toBe('human');
    expect(added[0].content).toContain('extract_graph');
  });

  it('재시도 횟수를 정하지 않으면 다섯 번까지 시도한다', async () => {
    const fake = fakeToolCallingModel([messageWithGraph({ nodes: [] })]);
    const transformer = createToolCallingGraphTransformer({ llm: fake.model });

    await expect(
      transformer.processResponse(new Document({ pageContent: '입력' })),
    ).rejects.toThrow('그래프 스키마를 통과하지 못했습니다.');
    expect(fake.getInvocations()).toBe(5);
  });

  it('도구를 호출하지 않고 일반 텍스트를 반환하면 오류를 던진다', async () => {
    const fake = fakeToolCallingModel([
      new AIMessage({ content: '{"nodes":[],"relationships":[]}' }),
    ]);
    const transformer = createToolCallingGraphTransformer({
      llm: fake.model,
      maxToolCallRetries: 1,
    });

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
  it.each([
    {
      reason: 'no_tool_call',
      response: new AIMessage({ content: '일반 텍스트' }),
    },
    {
      reason: 'unexpected_tool_calls',
      response: new AIMessage({
        content: '',
        tool_calls: [{ id: '다른호출', name: 'other_tool', args: validGraph }],
      }),
    },
    {
      reason: 'invalid_arguments',
      response: new AIMessage({
        content: '',
        invalid_tool_calls: [
          {
            id: '잘못된호출',
            name: 'extract_graph',
            args: '{',
            error: 'invalid_json',
          },
        ],
      }),
    },
    { reason: 'schema_mismatch', response: messageWithGraph({ nodes: [] }) },
  ])(
    'U7-33 $reason은 한 번 재시도하고 고정 reason 오류로 구분한다',
    async ({ reason, response }) => {
      const fake = fakeToolCallingModel([response]);
      const transformer = createToolCallingGraphTransformer({
        llm: fake.model,
        maxToolCallRetries: 1,
      });
      const pending = transformer.processResponse(
        new Document({ pageContent: '입력' }),
      );
      await expect(pending).rejects.toBeInstanceOf(
        ToolCallingGraphExtractionError,
      );
      await expect(pending).rejects.toMatchObject({ reason });
      expect(fake.getInvocations()).toBe(2);
    },
  );
  it('U7-10 유효한 빈 응답과 동시 두 문서 호출은 서로 독립적으로 변환한다', async () => {
    const fake = fakeToolCallingModel([
      messageWithGraph(validGraph),
      messageWithGraph({ nodes: [], relationships: [] }),
    ]);
    const transformer = createToolCallingGraphTransformer({ llm: fake.model });
    const docs = [
      new Document({ pageContent: '첫 문서' }),
      new Document({ pageContent: '둘째 문서' }),
    ];
    const results = await Promise.all(
      docs.map((doc) => transformer.processResponse(doc)),
    );
    expect(results[0].source).toBe(docs[0]);
    expect(results[0].nodes).toHaveLength(2);
    expect(results[1].source).toBe(docs[1]);
    expect(results[1].nodes).toHaveLength(0);
    expect(results[1].relationships).toHaveLength(0);
    expect(fake.getInvocations()).toBe(2);
  });
});
