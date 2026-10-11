import { Injectable } from '@nestjs/common';

import {
  TEAMSPACE_AGENT_NAME,
  TEAMSPACE_OPERATOR_DESCRIPTION,
  TEAMSPACE_OPERATOR_PROMPT,
  TEAMSPACE_RESEARCHER_DESCRIPTION,
  TEAMSPACE_RESEARCHER_PROMPT,
  TEAMSPACE_ROOT_PROMPT,
} from '@/agent/application/teamspace-agent.definition';
import { toolInputFeedbackMiddleware } from '@/agent/infrastructure/deep-agent/tool-input-feedback.middleware';
import { createToolResultLocalTimeMiddleware } from '@/agent/infrastructure/deep-agent/tool-result-local-time.middleware';
import type { TeamspaceToolSession } from '@/agent/infrastructure/mcp/teamspace-tool-session.provider';
import type { AgentModels } from '@/agent/infrastructure/model/agent-model.provider';

import type { StructuredTool } from '@langchain/core/tools';
import { createDeepAgent } from 'deepagents';

interface TeamspaceDeepAgentInput {
  models: AgentModels;
  tools: StructuredTool[];
  readOnlyTools: StructuredTool[];
  interruptOn: Record<string, true>;
  timeZone: string;
}

function createTeamspaceDeepAgent(input: TeamspaceDeepAgentInput) {
  const middleware = [
    toolInputFeedbackMiddleware,
    createToolResultLocalTimeMiddleware(input.timeZone),
  ];

  return createDeepAgent({
    name: TEAMSPACE_AGENT_NAME,
    model: input.models.root,
    tools: input.tools,
    interruptOn: input.interruptOn,
    systemPrompt: TEAMSPACE_ROOT_PROMPT,
    middleware,
    subagents: [
      {
        name: 'researcher',
        description: TEAMSPACE_RESEARCHER_DESCRIPTION,
        // 부모 대화를 물려받아 <system_context>의 조직·시각·화면을 그대로 안다.
        mode: 'fork',
        model: input.models.researcher,
        tools: input.readOnlyTools,
        systemPrompt: TEAMSPACE_RESEARCHER_PROMPT,
        middleware,
      },
      {
        name: 'operator',
        description: TEAMSPACE_OPERATOR_DESCRIPTION,
        mode: 'fork',
        model: input.models.operator,
        tools: input.tools,
        interruptOn: input.interruptOn,
        systemPrompt: TEAMSPACE_OPERATOR_PROMPT,
        middleware,
      },
    ],
  });
}

export type TeamspaceDeepAgent = ReturnType<typeof createTeamspaceDeepAgent>;

@Injectable()
export class DeepAgentBuilder {
  buildExecution(input: {
    models: AgentModels;
    session: TeamspaceToolSession;
    timeZone: string;
  }): TeamspaceDeepAgent {
    return createTeamspaceDeepAgent({
      models: input.models,
      tools: input.session.tools,
      readOnlyTools: input.session.readOnlyTools,
      interruptOn: input.session.interruptOn,
      timeZone: input.timeZone,
    });
  }

  buildState(models: AgentModels): TeamspaceDeepAgent {
    return createTeamspaceDeepAgent({
      models,
      tools: [],
      readOnlyTools: [],
      interruptOn: {},
      timeZone: 'UTC',
    });
  }
}
