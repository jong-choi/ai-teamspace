import { randomUUID } from 'node:crypto';

import { createNeo4jGraph, GraphDocument, Node } from '@repo/knowledge-graph';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';

import { Document } from '@langchain/core/documents';
import { z } from 'zod';

const describeWritable =
  process.env.KG_TEST_ALLOW_WRITE === '1' && process.env.NEO4J_URI
    ? describe
    : describe.skip;
jest.setTimeout(60_000);

describeWritable('기존 GraphDocument 전역 병합의 위험 특성화', () => {
  it('N7-01 baseEntityLabel의 같은 자연어id는 다른 조직의 입력도 하나로 병합한다', async () => {
    const config = knowledgeGraphConfig();
    if (!config.url || !config.username || !config.password)
      throw new Error('격리 CE 설정이 없습니다.');
    const graph = await createNeo4jGraph({
      url: config.url,
      username: config.username,
      password: config.password,
    });
    const id = `p7-merge-characterization-${randomUUID()}`;
    const constraintsQuery =
      "SHOW CONSTRAINTS YIELD name, labelsOrTypes, properties WHERE '__Entity__' IN labelsOrTypes AND properties=['id'] RETURN name";
    const before = new Set(
      (await graph.query(constraintsQuery)).map((row) =>
        z.string().parse(row.name),
      ),
    );
    try {
      for (const org of ['p7-characterization-a', 'p7-characterization-b']) {
        await graph.addGraphDocuments(
          [
            new GraphDocument({
              nodes: [
                new Node({
                  id,
                  type: 'Person',
                  properties: { organizationId: org },
                }),
              ],
              relationships: [],
              source: new Document({
                pageContent: '전역 이름 병합 검증',
                metadata: { organizationId: org },
              }),
            }),
          ],
          { baseEntityLabel: true },
        );
      }
      expect(
        await graph.query(
          'MATCH (n:__Entity__ {id:$id}) RETURN count(n) AS merged',
          { id },
        ),
      ).toEqual([{ merged: '1' }]);
    } finally {
      await graph.query('MATCH (n:__Entity__ {id:$id}) DETACH DELETE n', {
        id,
      });
      for (const row of await graph.query(constraintsQuery)) {
        const name = z
          .string()
          .regex(/^[A-Za-z0-9_]+$/)
          .parse(row.name);
        if (!before.has(name))
          await graph.query(`DROP CONSTRAINT ${name} IF EXISTS`);
      }
      await graph.close();
    }
  });
});
