import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import {
  CreateMcpAccessKeyDto,
  type CreateMcpAccessKeyInput,
  McpAccessKeyDto,
  McpAccessKeyListDto,
  McpAccessKeySecretDto,
  QueryMcpAccessKeysDto,
  type QueryMcpAccessKeysInput,
  UpdateMcpAccessKeyDto,
  type UpdateMcpAccessKeyInput,
} from '@/mcp-access-keys/dto/mcp-access-key.dto';
import { McpConnectionInfoDto } from '@/mcp-access-keys/dto/mcp-connection-info.dto';
import { parseMcpIdempotencyKey } from '@/mcp-access-keys/dto/mcp-idempotency-key';
import { McpAccessKeyLifecycleService } from '@/mcp-access-keys/mcp-access-key-lifecycle.service';
import { McpAccessKeysService } from '@/mcp-access-keys/mcp-access-keys.service';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('mcp')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 502, schema: problemDetailsSchema })
@Controller('mcp')
@UseGuards(TrustedOriginGuard)
export class McpAccessKeysController {
  constructor(
    private readonly service: McpAccessKeysService,
    private readonly lifecycle: McpAccessKeyLifecycleService,
  ) {}

  @Get('connection-info')
  @ApiOkResponse({ standardSchema: McpConnectionInfoDto.schema })
  getConnectionInfo(
    @Session() session: UserSession<Auth>,
  ): McpConnectionInfoDto {
    void session;
    return this.service.getConnectionInfo();
  }

  @Get('access-keys')
  @ApiOkResponse({ standardSchema: McpAccessKeyListDto.schema })
  list(
    @Session() session: UserSession<Auth>,
    @Query({ schema: QueryMcpAccessKeysDto.schema })
    query: QueryMcpAccessKeysInput,
  ): Promise<McpAccessKeyListDto> {
    return this.lifecycle.list(session.user.id, query);
  }

  @Post('access-keys')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: McpAccessKeySecretDto.schema })
  create(
    @Session() session: UserSession<Auth>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body({ schema: CreateMcpAccessKeyDto.schema })
    input: CreateMcpAccessKeyInput,
  ): Promise<McpAccessKeySecretDto> {
    return this.lifecycle.create(
      session.user.id,
      input,
      parseMcpIdempotencyKey(idempotencyKey),
    );
  }

  @Get('access-keys/:keyId')
  @ApiOkResponse({ standardSchema: McpAccessKeyDto.schema })
  get(
    @Session() session: UserSession<Auth>,
    @Param('keyId') keyId: string,
  ): Promise<McpAccessKeyDto> {
    return this.lifecycle.get(session.user.id, keyId);
  }

  @Patch('access-keys/:keyId')
  @ApiOkResponse({ standardSchema: McpAccessKeyDto.schema })
  update(
    @Session() session: UserSession<Auth>,
    @Param('keyId') keyId: string,
    @Body({ schema: UpdateMcpAccessKeyDto.schema })
    input: UpdateMcpAccessKeyInput,
  ): Promise<McpAccessKeyDto> {
    return this.lifecycle.update(session.user.id, keyId, input);
  }

  @Post('access-keys/:keyId/rotate')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: McpAccessKeySecretDto.schema })
  rotate(
    @Session() session: UserSession<Auth>,
    @Param('keyId') keyId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<McpAccessKeySecretDto> {
    return this.lifecycle.rotate(
      session.user.id,
      keyId,
      parseMcpIdempotencyKey(idempotencyKey),
    );
  }

  @Delete('access-keys/:keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async revoke(
    @Session() session: UserSession<Auth>,
    @Param('keyId') keyId: string,
  ): Promise<void> {
    await this.lifecycle.revoke(session.user.id, keyId);
  }
}
