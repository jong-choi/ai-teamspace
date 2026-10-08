import { Document } from '@langchain/core/documents';
import { ChatOllama } from '@langchain/ollama';

import { createToolCallingGraphTransformer } from '#knowledge-graph/tool-calling-structured-output.adapter.js';

const cloudKey = process.env.OLLAMA_API_KEY;
const runCloudTest = Boolean(
  cloudKey && process.env.KG_TEST_OLLAMA_CLOUD === '1',
);

(runCloudTest ? describe : describe.skip)(
  'Ollama Cloud 실제 Tool Calling 어댑터',
  () => {
    it('gpt-oss 120B가 도구로 추출한 노드와 관계를 변환한다', async () => {
      const llm = new ChatOllama({
        baseUrl: 'https://ollama.com',
        model: 'gpt-oss:120b',
        headers: { Authorization: `Bearer ${cloudKey}` },
        temperature: 0,
        maxRetries: 0,
      });

      const transformer = createToolCallingGraphTransformer({
        llm,
        allowedNodes: ['Person', 'Technology'],
        allowedRelationships: ['USES'],
        maxToolCallRetries: 1,
      });
      const graph = await transformer.processResponse(
        new Document({
          pageContent: '지윤은 Neo4j를 사용한다.',
          metadata: { id: 'ollama-cloud-test' },
        }),
      );

      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(
        graph.relationships.some(
          (relationship) => relationship.type === 'USES',
        ),
      ).toBe(true);
    }, 120_000);
  },
);
