import type {
  RunFinishedEvent,
  RunTelemetryContext,
  RunTelemetryEvent,
  TelemetrySink,
} from '@repo/agent-runtime';
import type { AgentConfig } from '@/agent/config/agent-config.type';
import {
  pseudonymizeLangfuseId,
  redactLangfuseValue,
} from '@/agent/infrastructure/observability/langfuse/langfuse-redaction';

import { CallbackHandler } from '@langfuse/langchain';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import {
  createTraceId,
  getLangfuseTracerProvider,
  type LangfuseAgent,
  LangfuseOtelSpanAttributes,
  propagateAttributes,
  setLangfuseTracerProvider,
  startActiveObservation,
} from '@langfuse/tracing';
import { context } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  NodeTracerProvider,
  RandomIdGenerator,
  type ReadableSpan,
  type Span,
  type SpanExporter,
  type SpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node';

type LangfuseConfiguration = NonNullable<
  AgentConfig['observability']
>['langfuse'];

type InFlightRun = {
  startedAt?: Date;
  queuedMs?: number;
  observation?: LangfuseAgent;
  touchedAt: number;
};

const MAX_IN_FLIGHT_RUNS = 2_048;
const IN_FLIGHT_TTL_MS = 30 * 60 * 1_000;
const LANGFUSE_VALUE_MAX_LENGTH = 200;

class LangfusePrivacySpanProcessor implements SpanProcessor {
  constructor(
    private readonly captureLevel: LangfuseConfiguration['captureLevel'],
  ) {}

  onStart(span: Span): void {
    void span;
  }

  onEnd(span: ReadableSpan): void {
    const attributes = span.attributes as Record<string, unknown>;

    for (const [key, value] of Object.entries(attributes)) {
      const metadataPrefix = [
        `${LangfuseOtelSpanAttributes.TRACE_METADATA}.`,
        `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.`,
      ].find((prefix) => key.startsWith(prefix));
      if (!metadataPrefix) continue;

      const metadataKey = key.slice(metadataPrefix.length);
      const sanitized = redactLangfuseValue({
        [metadataKey]: value,
      }) as Record<string, unknown>;
      attributes[key] = sanitized[metadataKey];
    }

    if (this.captureLevel !== 'metadata') return;

    delete attributes[LangfuseOtelSpanAttributes.TRACE_INPUT];
    delete attributes[LangfuseOtelSpanAttributes.TRACE_OUTPUT];
    delete attributes[LangfuseOtelSpanAttributes.OBSERVATION_INPUT];
    delete attributes[LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT];
  }

  async forceFlush(): Promise<void> {}

  async shutdown(): Promise<void> {}
}

function bounded(value: string): string {
  return value.slice(0, LANGFUSE_VALUE_MAX_LENGTH);
}

function finishLevel(
  status: RunFinishedEvent['status'],
): 'DEFAULT' | 'WARNING' | 'ERROR' {
  if (status === 'error' || status === 'timeout') return 'ERROR';
  if (status === 'cancelled' || status === 'interrupted') return 'WARNING';
  return 'DEFAULT';
}

function safeStatusMessage(event: RunFinishedEvent): string | undefined {
  const message = event.error?.message;
  if (!message) return undefined;
  const sanitized = redactLangfuseValue(message);
  return typeof sanitized === 'string' ? bounded(sanitized) : undefined;
}

export class LangfuseAgentTelemetryAdapter implements TelemetrySink {
  readonly name = 'langfuse';

  private readonly processor: LangfuseSpanProcessor;
  private readonly provider: NodeTracerProvider;
  private readonly contextManager = new AsyncLocalStorageContextManager();
  private readonly ownsContextManager: boolean;
  private readonly idGenerator = new RandomIdGenerator();
  private readonly inFlight = new Map<string, InFlightRun>();

  constructor(
    private readonly configuration: LangfuseConfiguration,
    exporter?: SpanExporter,
  ) {
    if (
      !configuration.enabled ||
      !configuration.baseUrl ||
      !configuration.publicKey ||
      !configuration.secretKey ||
      !configuration.idHashSecret
    ) {
      throw new Error(
        'LangfuseAgentTelemetryAdapter는 검증된 활성 Langfuse 설정이 필요합니다.',
      );
    }

    this.processor = new LangfuseSpanProcessor({
      publicKey: configuration.publicKey,
      secretKey: configuration.secretKey,
      baseUrl: configuration.baseUrl,
      environment: configuration.tracingEnvironment,
      release: configuration.release,
      mask: ({ data }) => redactLangfuseValue(data),
      mediaUploadEnabled: false,
      ...(exporter ? { exporter, exportMode: 'immediate' as const } : {}),
    });
    this.provider = new NodeTracerProvider({
      sampler: new TraceIdRatioBasedSampler(configuration.sampleRate),
      spanProcessors: [
        new LangfusePrivacySpanProcessor(configuration.captureLevel),
        this.processor,
      ],
    });

    // isolated tracer provider는 global 등록하지 않는다. 다만 active parent 전파에 필요한
    // OTel context manager가 아직 없다면 이 adapter가 AsyncLocalStorage manager만 소유한다.
    this.ownsContextManager = context.setGlobalContextManager(
      this.contextManager.enable(),
    );
    if (!this.ownsContextManager) this.contextManager.disable();

    setLangfuseTracerProvider(this.provider);
  }

  onRunEvent(event: RunTelemetryEvent): void {
    try {
      this.cleanupStaleRuns();
      if (event.type === 'run.started') {
        const existing = this.inFlight.get(event.context.runId);
        this.inFlight.set(event.context.runId, {
          ...existing,
          startedAt: event.startedAt,
          queuedMs: event.queuedMs,
          touchedAt: Date.now(),
        });
        this.trimInFlightRuns();
        return;
      }

      const state = this.inFlight.get(event.context.runId);
      if (!state?.observation) {
        this.inFlight.delete(event.context.runId);
        return;
      }

      state.observation.update({
        level: finishLevel(event.status),
        statusMessage: safeStatusMessage(event),
        metadata: {
          status: event.status,
          durationMs: event.durationMs,
          frameCount: event.frameCount,
          ...(state.queuedMs !== undefined ? { queuedMs: state.queuedMs } : {}),
          ...(event.failingNodes?.length
            ? { failingNodes: event.failingNodes.slice(0, 16) }
            : {}),
        },
      });
      state.observation.end(event.endedAt);
      this.inFlight.delete(event.context.runId);
    } catch {
      // Telemetry failure가 Agent run의 성공/실패 의미를 바꾸지 않게 한다.
    }
  }

  callbacks(context: RunTelemetryContext): unknown[] {
    try {
      return [
        new CallbackHandler({
          userId: this.pseudonymousUserId(context),
          sessionId: bounded(context.threadId),
          tags: this.traceTags(context),
          version: this.configuration.release,
          traceMetadata: this.traceMetadata(context),
        }),
      ];
    } catch {
      return [];
    }
  }

  traceMetadata(context: RunTelemetryContext): Record<string, unknown> {
    return {
      langfuse_run_id: bounded(context.runId),
      langfuse_trigger: context.trigger,
      langfuse_stream_modes: bounded(context.streamModes.join(',')),
      ...(context.assistantId
        ? { langfuse_assistant_id: bounded(context.assistantId) }
        : {}),
    };
  }

  traceTags(context: RunTelemetryContext): string[] {
    return [
      bounded(`trigger:${context.trigger}`),
      bounded(`environment:${this.configuration.tracingEnvironment}`),
    ];
  }

  async withRunContext<T>(
    context: RunTelemetryContext,
    body: () => Promise<T>,
  ): Promise<T> {
    const traceId = await createTraceId(context.runId);
    const state = this.inFlight.get(context.runId);
    const startedAt = state?.startedAt;

    return startActiveObservation(
      'agent-run',
      async (observation) => {
        this.inFlight.set(context.runId, {
          ...state,
          observation,
          touchedAt: Date.now(),
        });
        this.trimInFlightRuns();

        return propagateAttributes(
          {
            userId: this.pseudonymousUserId(context),
            sessionId: bounded(context.threadId),
            metadata: {
              runId: bounded(context.runId),
              graphId: bounded(context.graphId),
              trigger: context.trigger,
            },
            version: this.configuration.release,
            tags: this.traceTags(context),
            traceName: bounded(context.graphId),
            environment: this.configuration.tracingEnvironment,
            asBaggage: false,
          },
          body,
        );
      },
      {
        asType: 'agent',
        endOnExit: false,
        ...(startedAt ? { startTime: startedAt } : {}),
        parentSpanContext: {
          traceId,
          spanId: this.idGenerator.generateSpanId(),
          traceFlags: 0,
        },
      },
    );
  }

  async flush(): Promise<void> {
    await this.processor.forceFlush();
  }

  async shutdown(): Promise<void> {
    for (const state of this.inFlight.values()) {
      try {
        state.observation?.end();
      } catch {
        // 종료 중 telemetry handle 하나의 실패가 다른 handle 정리를 막지 않게 한다.
      }
    }
    this.inFlight.clear();

    try {
      await this.provider.shutdown();
    } finally {
      if (getLangfuseTracerProvider() === this.provider) {
        setLangfuseTracerProvider(null);
      }
      if (this.ownsContextManager) {
        context.disable();
        this.contextManager.disable();
      }
    }
  }

  private pseudonymousUserId(context: RunTelemetryContext): string | undefined {
    if (!context.userId) return undefined;
    return pseudonymizeLangfuseId(
      context.userId,
      this.configuration.idHashSecret!,
    );
  }

  private cleanupStaleRuns(): void {
    const cutoff = Date.now() - IN_FLIGHT_TTL_MS;
    for (const [runId, state] of this.inFlight) {
      if (state.touchedAt >= cutoff) continue;
      try {
        state.observation?.end();
      } finally {
        this.inFlight.delete(runId);
      }
    }
  }

  private trimInFlightRuns(): void {
    if (this.inFlight.size <= MAX_IN_FLIGHT_RUNS) return;

    const overflow = this.inFlight.size - MAX_IN_FLIGHT_RUNS;
    let removed = 0;
    for (const [runId, state] of this.inFlight) {
      if (removed >= overflow) break;
      try {
        state.observation?.end();
      } finally {
        this.inFlight.delete(runId);
        removed += 1;
      }
    }
  }
}
