import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AGENT_REASONING_EFFORTS,
  DEFAULT_AGENT_REASONING_EFFORT,
} from '@/agent/domain/agent-reasoning-effort';
import {
  type AgentModelInfoResponse,
  AgentModelInfoSchema,
} from '@/agent/dto/agent-model.dto';
import type { AllConfigType } from '@/config/config.type';

/** 채팅 화면이 표시할 built-in Agent 모델과 선택 가능한 추론 수준을 제공한다. */
@Injectable()
export class AgentModelService {
  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  getModelInfo(): AgentModelInfoResponse {
    const agent = this.configService.getOrThrow('agent', { infer: true });

    return AgentModelInfoSchema.parse({
      model: agent.model.name,
      supportedReasoningEfforts: AGENT_REASONING_EFFORTS,
      defaultReasoningEffort: DEFAULT_AGENT_REASONING_EFFORT,
    });
  }
}
