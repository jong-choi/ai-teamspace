import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AgentConfiguration } from '@/agent/config/agent-configuration';
import type { AllConfigType } from '@/config/config.type';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: AgentConfiguration,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AllConfigType>) =>
        new AgentConfiguration(
          configService.getOrThrow('agent', { infer: true }),
        ),
    },
  ],
  exports: [AgentConfiguration],
})
export class AgentConfigurationModule {}
