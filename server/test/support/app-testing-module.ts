import { Module } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';

import { AgentModule } from '@/agent/agent.module';
import { AppModule } from '@/app.module';

@Module({})
class DisabledAgentModule {}

/** Agent 인프라 없이 제품 HTTP 경계를 검증하는 AppModule test builder다. */
export function createAppTestingModule(): TestingModuleBuilder {
  return Test.createTestingModule({ imports: [AppModule] })
    .overrideModule(AgentModule)
    .useModule(DisabledAgentModule);
}
