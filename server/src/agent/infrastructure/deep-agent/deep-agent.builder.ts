import { Injectable } from '@nestjs/common';

import {
  WORKOS_AGENT_NAME,
  WORKOS_OPERATOR_DESCRIPTION,
  WORKOS_OPERATOR_PROMPT,
  WORKOS_RESEARCHER_DESCRIPTION,
  WORKOS_RESEARCHER_PROMPT,
  WORKOS_ROOT_PROMPT,
} from '@/agent/application/workos-agent.definition';
import { toolInputFeedbackMiddleware } from '@/agent/infrastructure/deep-agent/tool-input-feedback.middleware';
import type { WorkOsToolSession } from '@/agent/infrastructure/mcp/workos-tool-session.provider';
import type { AgentModels } from '@/agent/infrastructure/model/agent-model.provider';

import type { StructuredTool } from '@langchain/core/tools';
import { createDeepAgent } from 'deepagents';

interface WorkOsDeepAgentInput {
  models: AgentModels;
  tools: StructuredTool[];
  readOnlyTools: StructuredTool[];
  interruptOn: Record<string, true>;
}

function createWorkOsDeepAgent(input: WorkOsDeepAgentInput) {
  return createDeepAgent({
    name: WORKOS_AGENT_NAME,
    model: input.models.root,
    tools: input.tools,
    interruptOn: input.interruptOn,
    systemPrompt: WORKOS_ROOT_PROMPT,
    middleware: [toolInputFeedbackMiddleware],
    subagents: [
      {
        name: 'researcher',
        description: WORKOS_RESEARCHER_DESCRIPTION,
        // 부모 대화를 물려받아 <system_context>의 조직·시각·화면을 그대로 안다.
        mode: 'fork',
        model: input.models.researcher,
        tools: input.readOnlyTools,
        systemPrompt: WORKOS_RESEARCHER_PROMPT,
        middleware: [toolInputFeedbackMiddleware],
      },
      {
        name: 'operator',
        description: WORKOS_OPERATOR_DESCRIPTION,
        mode: 'fork',
        model: input.models.operator,
        tools: input.tools,
        interruptOn: input.interruptOn,
        systemPrompt: WORKOS_OPERATOR_PROMPT,
        middleware: [toolInputFeedbackMiddleware],
      },
    ],
  });
}

export type WorkOsDeepAgent = ReturnType<typeof createWorkOsDeepAgent>;

@Injectable()
export class DeepAgentBuilder {
  buildExecution(input: {
    models: AgentModels;
    session: WorkOsToolSession;
  }): WorkOsDeepAgent {
    return createWorkOsDeepAgent({
      models: input.models,
      tools: input.session.tools,
      readOnlyTools: input.session.readOnlyTools,
      interruptOn: input.session.interruptOn,
    });
  }

  buildState(models: AgentModels): WorkOsDeepAgent {
    return createWorkOsDeepAgent({
      models,
      tools: [],
      readOnlyTools: [],
      interruptOn: {},
    });
  }
}
