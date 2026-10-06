import {
  type BeforeApplicationShutdown,
  type DynamicModule,
  type FactoryProvider,
  Inject,
  Injectable,
  type MiddlewareConsumer,
  Module,
  type ModuleMetadata,
  type NestModule,
  type OnApplicationShutdown,
  RequestMethod,
} from '@nestjs/common';

import {
  type ResolvedProtocolRuntime,
  resolveProtocolRuntime,
  type SkeinRuntimeOptions,
} from '@repo/agent-runtime/server-kit';

import { AgentRuntimeMiddleware } from '#agent-runtime/nest/agent-runtime.middleware.js';
import {
  AGENT_RUNTIME,
  AGENT_RUNTIME_CORS,
  AGENT_RUNTIME_LOGGER,
  AGENT_RUNTIME_OPTIONS,
} from '#agent-runtime/nest/agent-runtime.tokens.js';
import { createNestLogger } from '#agent-runtime/nest/nest-logger.js';

export interface AgentRuntimeConfiguration {
  runtime: SkeinRuntimeOptions;
  dispose?: () => Promise<void> | void;
}

export interface AgentRuntimeModuleAsyncOptions
  extends
    Pick<ModuleMetadata, 'imports'>,
    Pick<FactoryProvider<AgentRuntimeConfiguration>, 'inject' | 'useFactory'> {}

@Injectable()
class AgentRuntimeLifecycle
  implements BeforeApplicationShutdown, OnApplicationShutdown
{
  private workerStopError: unknown;

  constructor(
    @Inject(AGENT_RUNTIME)
    private readonly resolved: ResolvedProtocolRuntime,
    @Inject(AGENT_RUNTIME_OPTIONS)
    private readonly configuration: AgentRuntimeConfiguration,
  ) {}

  async beforeApplicationShutdown(): Promise<void> {
    try {
      await this.resolved.runtime.worker.stop();
    } catch (error) {
      this.workerStopError = error;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    let disposeError: unknown;
    try {
      await this.configuration.dispose?.();
    } catch (error) {
      disposeError = error;
      this.resolved.logger?.error(
        'Agent runtime resource dispose failed during shutdown.',
        error,
      );
    }

    if (this.workerStopError) {
      this.resolved.logger?.error(
        'Agent runtime worker stop failed during shutdown.',
        this.workerStopError,
      );
    }

    const failures = [this.workerStopError, disposeError].filter(
      (failure) => failure !== undefined,
    );
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Agent runtime shutdown failed.');
    }
  }
}

/** 기존 Nest application 안에 Skein Agent Protocol runtime을 mount한다. */
@Module({})
export class AgentRuntimeModule implements NestModule {
  static forRoot(configuration: AgentRuntimeConfiguration): DynamicModule {
    return AgentRuntimeModule.forRootAsync({
      useFactory: () => configuration,
    });
  }

  static forRootAsync(options: AgentRuntimeModuleAsyncOptions): DynamicModule {
    return {
      module: AgentRuntimeModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: AGENT_RUNTIME_OPTIONS,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
        {
          provide: AGENT_RUNTIME,
          inject: [AGENT_RUNTIME_OPTIONS],
          useFactory: async (
            configuration: AgentRuntimeConfiguration,
          ): Promise<ResolvedProtocolRuntime> => {
            try {
              return await resolveProtocolRuntime(
                configuration.runtime,
                createNestLogger(),
              );
            } catch (error) {
              await configuration.dispose?.();
              throw error;
            }
          },
        },
        {
          provide: AGENT_RUNTIME_LOGGER,
          inject: [AGENT_RUNTIME],
          useFactory: (resolved: ResolvedProtocolRuntime) =>
            resolved.logger ?? null,
        },
        {
          provide: AGENT_RUNTIME_CORS,
          inject: [AGENT_RUNTIME_OPTIONS],
          useFactory: (configuration: AgentRuntimeConfiguration) =>
            configuration.runtime.cors ?? null,
        },
        AgentRuntimeMiddleware,
        AgentRuntimeLifecycle,
      ],
      exports: [AGENT_RUNTIME],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AgentRuntimeMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
