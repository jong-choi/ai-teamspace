import type { AgentActor } from '@/agent/domain/agent-actor';

import type { BaseLanguageModel } from '@langchain/core/language_models/base';

export type AgentModel = string | BaseLanguageModel;

export interface AgentModels {
  root: AgentModel;
  researcher: AgentModel;
  operator: AgentModel;
}

export abstract class AgentModelProvider {
  /** actor가 없으면 state/history reconstruction용 side-effect-free 모델 세트를 반환한다. */
  abstract createModels(actor?: AgentActor): AgentModels | Promise<AgentModels>;
}
