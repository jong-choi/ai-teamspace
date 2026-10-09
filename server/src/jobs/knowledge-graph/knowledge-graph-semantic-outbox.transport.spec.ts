import { Logger } from '@nestjs/common';
import { NonRetryableMessageError, type OutboxMessage } from '@nestjs/outbox';
import { Test } from '@nestjs/testing';

import { KnowledgeGraphSemanticOutboxTransport } from '@/jobs/knowledge-graph/knowledge-graph-semantic-outbox.transport';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';
import { SemanticDeliveryService } from '@/knowledge-graph/semantic-delivery.service';
import {
  KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC,
  KNOWLEDGE_GRAPH_SEMANTIC_MANUAL_TOPIC,
} from '@/outbox/outbox-semantic-event.schema';

describe('의미 Outbox의 관측·즉시 전달·고정 오류 경계', () => {
  const scope = {
    organizationId: 'p7-transport-org',
    aggregateKind: 'wiki_document',
    aggregateId: '10000000-0000-4000-8000-000000000001',
  } as const;
  const delivery = {
    observeCommitted: jest.fn<
      ReturnType<SemanticDeliveryService['observeCommitted']>,
      Parameters<SemanticDeliveryService['observeCommitted']>
    >(),
    markManualDelivered: jest.fn<
      ReturnType<SemanticDeliveryService['markManualDelivered']>,
      Parameters<SemanticDeliveryService['markManualDelivered']>
    >(),
  };
  const queue = { auto: jest.fn(), manual: jest.fn(), remove: jest.fn() };
  const config = { semanticEnabled: true };
  let transport: KnowledgeGraphSemanticOutboxTransport;
  let controller: AbortController;
  const event = {
    ...scope,
    operation: 'changed',
    sourceVersion: 1,
    occurredAt: '2026-10-09T00:00:00Z',
  };
  const message = (
    topic = KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC,
    payload: OutboxMessage['payload'] = event,
  ): OutboxMessage => ({
    id: '10000000-0000-4000-8000-000000000002',
    topic,
    payload,
    key: JSON.stringify([
      scope.aggregateKind,
      scope.organizationId,
      scope.aggregateId,
    ]),
    headers: {},
    createdAt: 0,
    availableAt: 0,
    attempts: 0,
    lastError: null,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    config.semanticEnabled = true;
    controller = new AbortController();
    delivery.observeCommitted.mockResolvedValue({
      kind: 'observed',
      delayMs: 300_000,
    });
    delivery.markManualDelivered.mockResolvedValue(undefined);
    queue.auto.mockResolvedValue(undefined);
    queue.manual.mockResolvedValue(undefined);
    queue.remove.mockResolvedValue(undefined);
    const app = await Test.createTestingModule({
      providers: [
        KnowledgeGraphSemanticOutboxTransport,
        { provide: knowledgeGraphConfig.KEY, useValue: config },
        { provide: SemanticDeliveryService, useValue: delivery },
        { provide: SemanticJobQueueProvider, useValue: queue },
      ],
    }).compile();
    transport = app.get(KnowledgeGraphSemanticOutboxTransport);
  });
  afterEach(() => jest.restoreAllMocks());

  it('U7-18 최초 PG 관측이 queue add보다 먼저 완료돼야 한다', async () => {
    let finish = () => {};
    delivery.observeCommitted.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = () => resolve({ kind: 'observed', delayMs: 300_000 });
      }),
    );
    const published = transport.publish(message(), {
      signal: controller.signal,
    });
    expect(queue.auto.mock.calls.length).toBe(0);
    finish();
    await published;
    expect(queue.auto).toHaveBeenCalledWith(scope, 300_000, controller.signal);
  });
  it('U7-18 flag off도 관측은 남기며 Redis 작업은 만들지 않는다', async () => {
    config.semanticEnabled = false;
    await transport.publish(message(), { signal: controller.signal });
    expect(delivery.observeCommitted).toHaveBeenCalledWith(scope, 1);
    expect(queue.auto.mock.calls.length).toBe(0);
  });
  it.each(['stale', 'missing'] as const)(
    'U7-18 %s 관측은 최신 타이머를 다시 예약하지 않는다',
    async (kind) => {
      delivery.observeCommitted.mockResolvedValueOnce({ kind });
      await transport.publish(message(), { signal: controller.signal });
      expect(queue.auto.mock.calls.length).toBe(0);
    },
  );
  it('U7-18 삭제는 자동 quiet를 기다리지 않고 tombstone 작업을 전달한다', async () => {
    await transport.publish(
      message(KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC, {
        ...event,
        operation: 'removed',
      }),
      { signal: controller.signal },
    );
    expect(queue.remove).toHaveBeenCalledWith(scope, 1, controller.signal);
    expect(queue.auto.mock.calls.length).toBe(0);
  });
  it('U7-18 수동 요청은 독립 requestId로 접수하고 전달 표시 실패는 고정 경고만 남긴다', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    delivery.markManualDelivered.mockRejectedValueOnce(
      new Error('private-provider-secret'),
    );
    const requestId = '10000000-0000-4000-8000-000000000003';
    await transport.publish(
      message(KNOWLEDGE_GRAPH_SEMANTIC_MANUAL_TOPIC, {
        ...scope,
        manualRequestSeq: 1,
        requestId,
        occurredAt: event.occurredAt,
      }),
      { signal: controller.signal },
    );
    expect(queue.manual).toHaveBeenCalledWith(
      scope,
      requestId,
      controller.signal,
    );
    expect(delivery.markManualDelivered).toHaveBeenCalledWith(scope, 1);
    expect(warn).toHaveBeenCalledWith({
      code: 'KG_SEMANTIC_MANUAL_DELIVERED_MARK_FAILED',
    });
  });
  it.each([
    { key: '다른 조직' },
    { payload: { ...event, contentMarkdown: '비공개 본문' } },
    { topic: '알 수 없는 topic' },
    { payload: { ...event, aggregateKind: 'project' } },
  ])(
    'U7-18 잘못된 key·원문 payload·topic·종류는 영구 전달 오류로 거부한다: %j',
    async (change) => {
      await expect(
        transport.publish(
          { ...message(), ...change },
          { signal: controller.signal },
        ),
      ).rejects.toBeInstanceOf(NonRetryableMessageError);
      expect(delivery.observeCommitted.mock.calls.length).toBe(0);
    },
  );
});
