import type {
  AgentGraph,
  AgentGraphRuntimeResources,
} from '@repo/agent-runtime';
import type { WorkOsDeepAgent } from '@/agent/infrastructure/deep-agent/deep-agent.builder';
import { DeepAgentLifecycle } from '@/agent/infrastructure/deep-agent/deep-agent-lifecycle';

import { Command } from '@langchain/langgraph';

type DeepAgentInput = Parameters<WorkOsDeepAgent['invoke']>[0];
type DeepAgentInvokeConfig = Parameters<WorkOsDeepAgent['invoke']>[1];
type DeepAgentStreamConfig = Parameters<WorkOsDeepAgent['stream']>[1];
type DeepAgentEventConfig = Parameters<WorkOsDeepAgent['streamEvents']>[1];
type DeepAgentHistoryOptions = Parameters<
  WorkOsDeepAgent['graph']['getStateHistory']
>[1];
type DeepAgentUpdateValues = Parameters<
  WorkOsDeepAgent['graph']['updateState']
>[1];
type DeepAgentSupersteps = Parameters<
  WorkOsDeepAgent['graph']['bulkUpdateState']
>[1];
type DeepAgentGraphConfig = Parameters<
  WorkOsDeepAgent['graph']['getGraphAsync']
>[0];
type DeepAgentCheckpointer = Exclude<
  WorkOsDeepAgent['checkpointer'],
  boolean | undefined
>;
type DeepAgentStore = NonNullable<WorkOsDeepAgent['store']>;

/** DeepAgent/ReactAgent를 제품 외부의 Agent Protocol contract로 변환한다. */
export class DeepAgentProtocolAdapter implements AgentGraph {
  constructor(
    private readonly agent: WorkOsDeepAgent,
    private readonly lifecycle: DeepAgentLifecycle,
  ) {}

  get builder(): object {
    return this.agent.builder;
  }

  stream(input: unknown, config?: unknown): AsyncIterable<unknown> {
    const agentInput = toDeepAgentInput(input);
    const agentConfig = toStreamConfig(config);
    return this.lifecycle.iterable(async () => {
      await assertHitlResumeIntegrity(this.agent, agentInput, agentConfig);
      return this.agent.stream(agentInput, agentConfig);
    });
  }

  getState(config: {
    configurable?: Record<string, unknown>;
  }): Promise<Awaited<ReturnType<WorkOsDeepAgent['graph']['getState']>>> {
    return this.lifecycle.value(() => this.agent.graph.getState(config));
  }

  getStateHistory(
    config: { configurable?: Record<string, unknown> },
    options?: unknown,
  ): AsyncIterable<Awaited<ReturnType<WorkOsDeepAgent['graph']['getState']>>> {
    const historyOptions = toHistoryOptions(options);
    return this.lifecycle.iterable(() =>
      this.agent.graph.getStateHistory(config, historyOptions),
    );
  }

  updateState(
    config: { configurable?: Record<string, unknown> },
    values: unknown,
    asNode?: string,
  ) {
    return this.lifecycle.value(() =>
      this.agent.graph.updateState(config, toUpdateValues(values), asNode),
    );
  }

  bulkUpdateState(
    config: { configurable?: Record<string, unknown> },
    supersteps: unknown,
  ) {
    return this.lifecycle.value(() =>
      this.agent.graph.bulkUpdateState(config, toSupersteps(supersteps)),
    );
  }

  invoke(input: unknown, config?: unknown): Promise<unknown> {
    const agentInput = toDeepAgentInput(input);
    const agentConfig = toInvokeConfig(config);
    return this.lifecycle.value(async () => {
      await assertHitlResumeIntegrity(this.agent, agentInput, agentConfig);
      return this.agent.invoke(agentInput, agentConfig);
    });
  }

  streamEvents(input: unknown, config?: unknown): AsyncIterable<unknown> {
    const agentInput = toDeepAgentInput(input);
    const agentConfig = toEventConfig(config);
    return this.lifecycle.iterable(async () => {
      await assertHitlResumeIntegrity(this.agent, agentInput, agentConfig);
      return this.agent.streamEvents(agentInput, agentConfig);
    });
  }

  getGraphAsync(config?: unknown) {
    return this.lifecycle.value(() =>
      this.agent.graph.getGraphAsync(toGraphConfig(config)),
    );
  }

  getSubgraphsAsync(namespace?: string, recurse?: boolean) {
    return this.lifecycle.iterable(() =>
      this.agent.graph.getSubgraphsAsync(namespace, recurse),
    );
  }

  bindRuntimeResources(resources: AgentGraphRuntimeResources): void {
    if (resources.checkpointer !== undefined) {
      if (!isDeepAgentCheckpointer(resources.checkpointer)) {
        throw new TypeError(
          'Agent checkpointer가 LangGraph contract와 호환되지 않습니다.',
        );
      }
      this.agent.checkpointer = resources.checkpointer;
    }

    if (resources.store !== undefined) {
      if (!isDeepAgentStore(resources.store)) {
        throw new TypeError(
          'Agent store가 LangGraph contract와 호환되지 않습니다.',
        );
      }
      this.agent.store = resources.store;
    }
  }
}

async function assertHitlResumeIntegrity(
  agent: WorkOsDeepAgent,
  input: DeepAgentInput,
  config: unknown,
): Promise<void> {
  if (!(input instanceof Command)) return;

  const decisions = hitlDecisions(input.resume);
  if (!decisions) return;

  const state = await agent.graph.getState(toStateConfig(config));
  const actionNames = pendingHitlActionNames(state);
  if (actionNames.length === 0 || actionNames.length !== decisions.length) {
    throw new Error(
      'HITL resume 대상과 현재 interrupted action이 일치하지 않습니다.',
    );
  }

  decisions.forEach((decision, index) => {
    if (!isEditDecision(decision)) return;

    const editedAction = decision['editedAction'];
    const editedName =
      isRecord(editedAction) && typeof editedAction['name'] === 'string'
        ? editedAction['name']
        : undefined;
    if (!editedName || editedName !== actionNames[index]) {
      throw new Error(
        'HITL edit는 interrupted tool identity를 변경할 수 없습니다.',
      );
    }
  });
}

function hitlDecisions(resume: unknown): unknown[] | undefined {
  if (!isRecord(resume)) return undefined;
  const decisions = resume['decisions'];
  return Array.isArray(decisions) ? decisions : undefined;
}

function isEditDecision(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value['type'] === 'edit';
}

function pendingHitlActionNames(state: unknown): string[] {
  if (!isRecord(state) || !Array.isArray(state['tasks'])) return [];

  const names: string[] = [];
  for (const task of state['tasks']) {
    if (!isRecord(task) || !Array.isArray(task['interrupts'])) continue;
    for (const interrupt of task['interrupts']) {
      if (!isRecord(interrupt) || !isRecord(interrupt['value'])) continue;
      const requests = interrupt['value']['actionRequests'];
      if (!Array.isArray(requests)) continue;
      for (const request of requests) {
        if (!isRecord(request) || typeof request['name'] !== 'string') {
          return [];
        }
        names.push(request['name']);
      }
    }
  }
  return names;
}

function toStateConfig(config: unknown): {
  configurable?: Record<string, unknown>;
} {
  if (!isRecord(config) || !isRecord(config['configurable'])) return {};
  return { configurable: config['configurable'] };
}

function toDeepAgentInput(input: unknown): DeepAgentInput {
  if (isDeepAgentInput(input)) return input;
  throw new TypeError(
    'DeepAgent input은 messages state 또는 Command여야 합니다.',
  );
}

function isDeepAgentInput(input: unknown): input is DeepAgentInput {
  if (input === null || input instanceof Command) return true;
  return isRecord(input) && Array.isArray(input['messages']);
}

function toInvokeConfig(config: unknown): DeepAgentInvokeConfig {
  if (config === undefined) return undefined;
  if (isRecord(config)) return config;
  throw new TypeError('DeepAgent invoke config는 object여야 합니다.');
}

function toStreamConfig(config: unknown): DeepAgentStreamConfig {
  if (config === undefined) return undefined;
  if (isRecord(config)) return config;
  throw new TypeError('DeepAgent stream config는 object여야 합니다.');
}

function toEventConfig(config: unknown): DeepAgentEventConfig {
  if (config === undefined) return undefined;
  if (isRecord(config)) return config;
  throw new TypeError('DeepAgent event config는 object여야 합니다.');
}

function toHistoryOptions(options: unknown): DeepAgentHistoryOptions {
  if (options === undefined) return undefined;
  if (isRecord(options)) return options;
  throw new TypeError('DeepAgent history options는 object여야 합니다.');
}

function toUpdateValues(values: unknown): DeepAgentUpdateValues {
  if (values instanceof Command || isRecord(values)) return values;
  throw new TypeError('DeepAgent state update values가 올바르지 않습니다.');
}

function toSupersteps(supersteps: unknown): DeepAgentSupersteps {
  if (Array.isArray(supersteps)) return supersteps;
  throw new TypeError('DeepAgent bulk update supersteps는 array여야 합니다.');
}

function toGraphConfig(config: unknown): DeepAgentGraphConfig {
  if (config === undefined) return undefined;
  if (isRecord(config)) return config;
  throw new TypeError('DeepAgent graph config는 object여야 합니다.');
}

function isDeepAgentCheckpointer(
  value: unknown,
): value is DeepAgentCheckpointer {
  return (
    isRecord(value) &&
    typeof value['getTuple'] === 'function' &&
    typeof value['list'] === 'function' &&
    typeof value['put'] === 'function' &&
    typeof value['putWrites'] === 'function'
  );
}

function isDeepAgentStore(value: unknown): value is DeepAgentStore {
  return isRecord(value) && typeof value['batch'] === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
