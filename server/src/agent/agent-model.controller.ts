import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { AgentModelService } from '@/agent/agent-model.service';
import { AgentModelInfoDto } from '@/agent/dto/agent-model.dto';

import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('agent')
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@Controller('agent/model')
export class AgentModelController {
  constructor(private readonly service: AgentModelService) {}

  @Get()
  @ApiOkResponse({ standardSchema: AgentModelInfoDto.schema })
  getModelInfo(): AgentModelInfoDto {
    return this.service.getModelInfo();
  }
}
