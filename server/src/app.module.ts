import { Module } from '@nestjs/common';

import { AgentModule } from '@/agent/agent.module';
import { AppCoreModule } from '@/app-core.module';

@Module({
  imports: [AgentModule, AppCoreModule],
})
export class AppModule {}
