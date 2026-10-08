import { Module } from '@nestjs/common';

import { AgentModelController } from '@/agent/agent-model.controller';
import { AgentModelService } from '@/agent/agent-model.service';

/** Agent runtime과 분리된 모델 정보 HTTP 경계다. OpenAPI 생성 시에도 함께 로드된다. */
@Module({
  controllers: [AgentModelController],
  providers: [AgentModelService],
})
export class AgentModelModule {}
