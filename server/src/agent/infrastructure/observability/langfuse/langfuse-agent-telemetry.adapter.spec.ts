import type { RunTelemetryContext } from '@repo/agent-runtime/core';
import type { AgentConfig } from '@/agent/config/agent-config.type';
import { LangfuseAgentTelemetryAdapter } from '@/agent/infrastructure/observability/langfuse/langfuse-agent-telemetry.adapter';

import { CallbackHandler } from '@langfuse/langchain';
import { createTraceId } from '@langfuse/tracing';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-node';

const configuration = {
  enabled: true,
  baseUrl: 'https://cloud.langfuse.com',
  publicKey: 'pk-test',
  secretKey: 'sk-test',
  tracingEnvironment: 'test',
  release: 'test-release',
  sampleRate: 1,
  captureLevel: 'metadata',
  idHashSecret: '0123456789abcdef0123456789abcdef',
} satisfies NonNullable<AgentConfig['observability']>['langfuse'];

const context: RunTelemetryContext = {
  runId: 'run-123',
  threadId: 'thread-123',
  assistantId: 'assistant-123',
  graphId: 'work-os-agent',
  userId: 'raw-user-123',
  trigger: 'stream',
  streamModes: ['messages'],
};

describe('Langfuse Agent telemetry adapter', () => {
  it('run-scoped CallbackHandler를 생성하고 raw user id를 전달하지 않는다', () => {
    const exporter = new InMemorySpanExporter();
    const adapter = new LangfuseAgentTelemetryAdapter(configuration, exporter);

    const first = adapter.callbacks(context);
    const second = adapter.callbacks(context);

    expect(first).toHaveLength(1);
    expect(first[0]).toBeInstanceOf(CallbackHandler);
    expect(second[0]).toBeInstanceOf(CallbackHandler);
    expect(second[0]).not.toBe(first[0]);

    const serialized = JSON.stringify([
      first[0],
      adapter.traceMetadata(context),
    ]);
    expect(serialized).not.toContain(context.userId);

    return adapter.shutdown();
  });

  it('metadata-only에서는 CallbackHandler child의 content와 raw identity를 export하지 않는다', async () => {
    const exporter = new InMemorySpanExporter();
    const adapter = new LangfuseAgentTelemetryAdapter(configuration, exporter);
    const handler = adapter.callbacks(context)[0] as CallbackHandler;

    adapter.onRunEvent({
      type: 'run.started',
      context,
      startedAt: new Date('2026-10-07T12:00:00.000Z'),
    });

    await adapter.withRunContext(context, async () => {
      await handler.handleChainStart(
        {
          lc: 1,
          type: 'not_implemented',
          id: ['fixture', 'chain'],
        },
        { prompt: 'private-prompt-canary' },
        'langchain-run-1',
        undefined,
        [],
        {
          user_id: context.userId,
          organization_id: 'raw-org-123',
          authorization: 'Bearer private-token',
        },
        'chain',
        'fixture-chain',
      );
      await handler.handleChainEnd(
        { output: 'private-output-canary' },
        'langchain-run-1',
      );
    });

    adapter.onRunEvent({
      type: 'run.finished',
      context,
      status: 'success',
      durationMs: 10,
      frameCount: 0,
      endedAt: new Date('2026-10-07T12:00:00.010Z'),
    });

    await adapter.flush();
    const spans = exporter.getFinishedSpans();
    expect(spans.map((span) => span.name)).toEqual(
      expect.arrayContaining(['agent-run', 'fixture-chain']),
    );
    const root = spans.find((span) => span.name === 'agent-run');
    const child = spans.find((span) => span.name === 'fixture-chain');
    expect(root).toBeDefined();
    expect(child).toBeDefined();
    expect(child?.spanContext().traceId).toBe(root?.spanContext().traceId);
    expect(child?.parentSpanContext?.spanId).toBe(root?.spanContext().spanId);

    const exported = JSON.stringify(
      spans.map((span) => ({
        name: span.name,
        attributes: span.attributes,
      })),
    );
    expect(exported).not.toContain('private-prompt-canary');
    expect(exported).not.toContain('private-output-canary');
    expect(exported).not.toContain(context.userId);
    expect(exported).not.toContain('raw-org-123');
    expect(exported).not.toContain('private-token');

    await adapter.shutdown();
  });

  it('deterministic trace id root를 terminal event까지 열어 둔다', async () => {
    const exporter = new InMemorySpanExporter();
    const adapter = new LangfuseAgentTelemetryAdapter(configuration, exporter);
    const startedAt = new Date('2026-10-07T12:00:00.000Z');

    adapter.onRunEvent({
      type: 'run.started',
      context,
      startedAt,
      queuedMs: 25,
    });

    await expect(
      adapter.withRunContext(context, async () => 'completed'),
    ).resolves.toBe('completed');

    await adapter.flush();
    expect(exporter.getFinishedSpans()).toHaveLength(0);

    adapter.onRunEvent({
      type: 'run.finished',
      context,
      status: 'success',
      durationMs: 120,
      frameCount: 3,
      endedAt: new Date('2026-10-07T12:00:00.120Z'),
    });

    await adapter.flush();
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe('agent-run');
    expect(spans[0]?.spanContext().traceId).toBe(
      await createTraceId(context.runId),
    );
    expect(JSON.stringify(spans[0]?.attributes)).not.toContain(context.userId);

    await adapter.shutdown();
  });

  it('sample rate가 0이어도 body 실행 결과를 바꾸지 않는다', async () => {
    const exporter = new InMemorySpanExporter();
    const adapter = new LangfuseAgentTelemetryAdapter(
      { ...configuration, sampleRate: 0 },
      exporter,
    );

    adapter.onRunEvent({
      type: 'run.started',
      context,
      startedAt: new Date('2026-10-07T12:00:00.000Z'),
    });
    await expect(adapter.withRunContext(context, async () => 42)).resolves.toBe(
      42,
    );
    adapter.onRunEvent({
      type: 'run.finished',
      context,
      status: 'success',
      durationMs: 1,
      frameCount: 0,
      endedAt: new Date('2026-10-07T12:00:00.001Z'),
    });

    await adapter.flush();
    expect(exporter.getFinishedSpans()).toHaveLength(0);
    await adapter.shutdown();
  });
});
