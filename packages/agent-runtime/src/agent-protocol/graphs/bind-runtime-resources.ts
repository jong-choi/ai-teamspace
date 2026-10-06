import type {
  AgentGraph,
  AgentGraphRuntimeResources,
} from '#agent-runtime/agent-protocol/graphs/agent-graph.js';

/** graph 구현이 제공한 정식 binding capability를 우선하고 기존 LangGraph property 계약은 fallback으로만 쓴다. */
export function bindAgentGraphRuntimeResources(
  graph: AgentGraph,
  resources: AgentGraphRuntimeResources,
): void {
  if (graph.bindRuntimeResources) {
    graph.bindRuntimeResources(resources);
    return;
  }

  if (resources.checkpointer !== undefined) {
    Reflect.set(graph, 'checkpointer', resources.checkpointer);
  }
  if (resources.store !== undefined) {
    Reflect.set(graph, 'store', resources.store);
  }
}
