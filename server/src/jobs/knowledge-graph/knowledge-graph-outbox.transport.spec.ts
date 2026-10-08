import { NonRetryableMessageError, type OutboxMessage } from '@nestjs/outbox';

import { KnowledgeGraphOutboxTransport } from '@/jobs/knowledge-graph/knowledge-graph-outbox.transport';
import { KNOWLEDGE_GRAPH_SOURCE_CHANGED_JOB } from '@/jobs/knowledge-graph/knowledge-graph-projection.job';
import { KNOWLEDGE_GRAPH_OUTBOX_TOPIC } from '@/outbox/outbox-aggregate-change.publisher';
import { OutboxAggregateEventSchema } from '@/outbox/outbox-aggregate-event.schema';

describe('그래프 Outbox의 BullMQ 전달 경계', () => {
  const payload = OutboxAggregateEventSchema.parse({
    organizationId: 'org-a',
    aggregateKind: 'wiki_document',
    aggregateId: 'wiki-a',
    operation: 'changed',
    sourceVersion: 1,
    occurredAt: '2026-10-09T00:00:00.000Z',
  });
  const message: OutboxMessage = {
    id: 'message-one',
    topic: KNOWLEDGE_GRAPH_OUTBOX_TOPIC,
    payload,
    key: JSON.stringify(['wiki_document', 'org-a', 'wiki-a']),
    headers: {},
    createdAt: 0,
    availableAt: 0,
    attempts: 0,
    lastError: null,
  };
  const add = jest.fn();
  const close = jest.fn();
  let transport: KnowledgeGraphOutboxTransport;
  let controller: AbortController;

  beforeEach(() => {
    jest.resetAllMocks();
    add.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
    transport = new KnowledgeGraphOutboxTransport(
      { add, close },
      { status: 'ready', disconnect: jest.fn() },
    );
    controller = new AbortController();
  });

  it('broker 접수가 끝나기 전에는 relay에 성공을 반환하지 않는다', async () => {
    let accepted: (value: void) => void = () => {};
    add.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        accepted = resolve;
      }),
    );
    let settled = false;
    const pending = transport
      .publish(message, { signal: controller.signal })
      .then(() => {
        settled = true;
      });
    await Promise.resolve();
    expect(settled).toBe(false);
    accepted();
    await pending;
    expect(settled).toBe(true);
    expect(add).toHaveBeenCalledWith(
      KNOWLEDGE_GRAPH_SOURCE_CHANGED_JOB,
      payload,
      expect.objectContaining({
        jobId: message.id,
        attempts: 10,
        backoff: { type: 'exponential', delay: 1_000 },
      }),
    );
  });

  it('Redis 오류 원문 대신 고정된 오류만 Outbox에 전달한다', async () => {
    add.mockRejectedValueOnce(
      new Error('redis://private-user:private-password@host'),
    );
    await expect(
      transport.publish(message, { signal: controller.signal }),
    ).rejects.toThrow('KNOWLEDGE_GRAPH_OUTBOX_PUBLISH_FAILED');
  });

  it('이미 취소된 전달은 queue를 호출하지 않는다', async () => {
    controller.abort(new Error('민감한 취소 원문'));
    await expect(
      transport.publish(message, { signal: controller.signal }),
    ).rejects.toThrow('KNOWLEDGE_GRAPH_OUTBOX_PUBLISH_ABORTED');
    expect(add).not.toHaveBeenCalled();
  });

  it('진행 중 publish 취소는 기다림을 끝내고 지연 성공도 안전하게 수용한다', async () => {
    let accepted: (value: void) => void = () => {};
    add.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        accepted = resolve;
      }),
    );
    const pending = transport.publish(message, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow(
      'KNOWLEDGE_GRAPH_OUTBOX_PUBLISH_ABORTED',
    );
    accepted();
    await Promise.resolve();
    expect(add).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...message, topic: 'unknown-topic' },
    { ...message, payload: { ...payload, sourceVersion: 0 } },
    {
      ...message,
      payload: { ...payload, sourceVersion: Number.MAX_SAFE_INTEGER + 1 },
    },
    { ...message, payload: { ...payload, organizationId: '' } },
    { ...message, payload: { ...payload, aggregateKind: 'unsupported' } },
    { ...message, payload: { ...payload, hiddenExtra: '원문' } },
    { ...message, key: '다른-원본-key' },
  ])(
    '잘못된 message는 queue 전달 전에 재시도 불가 오류로 거부한다: %j',
    async (invalid) => {
      await expect(
        transport.publish(invalid, { signal: controller.signal }),
      ).rejects.toBeInstanceOf(NonRetryableMessageError);
      expect(add).not.toHaveBeenCalled();
    },
  );

  it('종료 때 소유 producer queue를 닫는다', async () => {
    await transport.onApplicationShutdown();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('연결이 준비되지 않았으면 종료 없이 대기하는 add를 만들지 않는다', async () => {
    const disconnect = jest.fn();
    const offline = new KnowledgeGraphOutboxTransport(
      { add, close },
      { status: 'reconnecting', disconnect },
    );
    await expect(
      offline.publish(message, { signal: controller.signal }),
    ).rejects.toThrow('KNOWLEDGE_GRAPH_OUTBOX_QUEUE_NOT_READY');
    expect(add).not.toHaveBeenCalled();
    await offline.onApplicationShutdown();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
