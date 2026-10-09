import {
  RefreshKnowledgeGraphAcceptedSchema,
  RefreshKnowledgeGraphSchema,
  WikiKnowledgeGraphStatusSchema,
} from '@/knowledge-graph/dto/wiki-knowledge-graph.dto';

const requestId = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-10-09T00:00:00.000Z';

describe('위키 지식 그래프 HTTP DTO', () => {
  it('refresh body는 빈 object만 허용한다', () => {
    expect(RefreshKnowledgeGraphSchema.parse({})).toEqual({});
    expect(() =>
      RefreshKnowledgeGraphSchema.parse({ content: '본문' }),
    ).toThrow();
    expect(() =>
      RefreshKnowledgeGraphSchema.parse({ model: 'other' }),
    ).toThrow();
    expect(() =>
      RefreshKnowledgeGraphSchema.parse({ cypher: 'MATCH (n)' }),
    ).toThrow();
  });

  it('202 응답은 accepted literal과 ISO timestamp를 고정한다', () => {
    expect(
      RefreshKnowledgeGraphAcceptedSchema.parse({
        requestId,
        status: 'accepted',
        sourceUpdatedAt: timestamp,
        acceptedAt: timestamp,
      }),
    ).toEqual({
      requestId,
      status: 'accepted',
      sourceUpdatedAt: timestamp,
      acceptedAt: timestamp,
    });

    expect(() =>
      RefreshKnowledgeGraphAcceptedSchema.parse({
        requestId,
        status: 'queued',
        sourceUpdatedAt: timestamp,
        acceptedAt: timestamp,
      }),
    ).toThrow();
    expect(() =>
      RefreshKnowledgeGraphAcceptedSchema.parse({
        requestId,
        status: 'accepted',
        sourceUpdatedAt: 'not-a-date',
        acceptedAt: timestamp,
      }),
    ).toThrow();
  });

  it('status 응답은 nullable 메타데이터와 strict 계약을 유지한다', () => {
    const response = {
      status: 'not_indexed',
      sourceUpdatedAt: timestamp,
      indexedSourceUpdatedAt: null,
      autoEligibleAt: null,
      requestId: null,
      requestedAt: null,
      latestRequest: null,
      completedAt: null,
      errorCode: null,
    };

    expect(WikiKnowledgeGraphStatusSchema.parse(response)).toEqual(response);
    expect(() =>
      WikiKnowledgeGraphStatusSchema.parse({
        ...response,
        rawPayload: 'secret',
      }),
    ).toThrow();
  });

  it('latestRequest는 요청 ID·시각·satisfied만 허용한다', () => {
    const response = {
      status: 'accepted',
      sourceUpdatedAt: timestamp,
      indexedSourceUpdatedAt: null,
      autoEligibleAt: null,
      requestId,
      requestedAt: timestamp,
      latestRequest: {
        requestId,
        requestedAt: timestamp,
        satisfied: false,
      },
      completedAt: null,
      errorCode: null,
    };

    expect(WikiKnowledgeGraphStatusSchema.parse(response)).toEqual(response);
    expect(() =>
      WikiKnowledgeGraphStatusSchema.parse({
        ...response,
        latestRequest: { ...response.latestRequest, queuePayload: 'hidden' },
      }),
    ).toThrow();
  });
});
