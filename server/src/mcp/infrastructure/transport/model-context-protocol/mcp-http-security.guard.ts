import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  hostHeaderValidationResponse,
  originValidationResponse,
} from '@modelcontextprotocol/server';

import type { AllConfigType } from '@/config/config.type';

@Injectable()
export class McpHttpSecurityGuard {
  private readonly allowedHosts: string[];
  private readonly allowedOrigins: string[];

  constructor(configService: ConfigService<AllConfigType>) {
    const config = configService.getOrThrow('mcp', { infer: true });
    this.allowedHosts = config.allowedHosts;
    this.allowedOrigins = config.allowedOrigins;
  }

  reject(request: Request): Response | undefined {
    return (
      hostHeaderValidationResponse(request, this.allowedHosts) ??
      originValidationResponse(request, this.allowedOrigins)
    );
  }
}
