import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { GuardedSafeOutboundHttpAdapter } from '@/agent-mcp-connections/infrastructure/http/guarded-safe-outbound-http.adapter';
import { SafeOutboundHttp } from '@/agent-mcp-connections/infrastructure/http/safe-outbound-http';
import type { AllConfigType } from '@/config/config.type';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SafeOutboundHttp,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AllConfigType>) =>
        new GuardedSafeOutboundHttpAdapter(
          configService.getOrThrow('agentMcpConnections', { infer: true }),
        ),
    },
  ],
  exports: [SafeOutboundHttp],
})
export class SafeOutboundHttpModule {}
