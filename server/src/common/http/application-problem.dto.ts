import { ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';

import { PROBLEM_CONTENT_TYPE } from '@camcima/nestjs-rfc9457';
import { ProblemDetailDto } from '@camcima/nestjs-rfc9457/swagger';

export class ApplicationProblemDto extends ProblemDetailDto {
  @ApiPropertyOptional({ type: String })
  code?: string;

  @ApiPropertyOptional({ type: [String] })
  errors?: string[];
}

export const problemResponse = {
  content: {
    [PROBLEM_CONTENT_TYPE]: {
      schema: { $ref: getSchemaPath(ApplicationProblemDto) },
    },
  },
};
