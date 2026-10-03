import { HttpException } from '@nestjs/common';

import {
  PROBLEM_CONTENT_TYPE,
  ProblemDetailsFactory,
} from '@camcima/nestjs-rfc9457';
import type { BetterAuthPlugin } from 'better-auth';
import { z } from 'zod';

const authErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export async function toAuthProblemResponse(
  factory: ProblemDetailsFactory,
  response: Response,
  request?: Request,
): Promise<Response> {
  if (
    response.status < 400 ||
    response.status > 599 ||
    response.headers.get('content-type')?.includes(PROBLEM_CONTENT_TYPE)
  )
    return response;
  const payload: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  const parsed = authErrorSchema.safeParse(payload);
  const { body, status } = factory.create(
    new HttpException(
      parsed.success ? (parsed.data.message ?? '') : '',
      response.status,
    ),
    {
      url: request ? new URL(request.url).pathname : '',
      method: request?.method ?? '',
    },
  );
  if (parsed.success && parsed.data.code) body.code = parsed.data.code;
  if (!request) delete body.instance;
  const headers = new Headers(response.headers);
  headers.set('content-type', PROBLEM_CONTENT_TYPE);
  headers.delete('content-length');
  return new Response(JSON.stringify(body), { status, headers });
}

export function problemDetailsPlugin(
  factory: ProblemDetailsFactory,
): BetterAuthPlugin {
  return {
    id: 'work-os-problem-details',
    async onResponse(response) {
      // HTTP 응답에만 적용하고 SDK의 APIError 계약은 유지한다.
      const converted = await toAuthProblemResponse(factory, response);
      if (converted !== response) return { response: converted };
    },
  };
}
