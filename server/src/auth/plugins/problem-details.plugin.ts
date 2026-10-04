import { STATUS_CODES } from 'node:http';

import type { BetterAuthPlugin } from 'better-auth';
import { z } from 'zod';

const PROBLEM_CONTENT_TYPE = 'application/problem+json';
const DEFAULT_PROBLEM_TYPE = 'about:blank';

const authErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

type ProblemDetailsPluginOptions = {
  disabledPaths?: readonly string[];
};

type AuthProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errorCode?: string;
};

function createProblemResponse(
  status: number,
  options: {
    detail?: string;
    errorCode?: string;
    headers?: HeadersInit;
  } = {},
): Response {
  const body: AuthProblemDetails = {
    type: DEFAULT_PROBLEM_TYPE,
    title: STATUS_CODES[status] ?? 'Error',
    status,
  };

  if (status < 500 && options.detail) body.detail = options.detail;
  if (options.errorCode) body.errorCode = options.errorCode;

  const headers = new Headers(options.headers);
  headers.set('content-type', PROBLEM_CONTENT_TYPE);
  headers.delete('content-length');

  return new Response(JSON.stringify(body), { status, headers });
}

export async function toProblemDetailsResponse(
  response: Response,
): Promise<Response> {
  if (
    response.status < 400 ||
    response.status > 599 ||
    response.headers.get('content-type')?.includes(PROBLEM_CONTENT_TYPE)
  ) {
    return response;
  }

  const payload: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  const parsed = authErrorSchema.safeParse(payload);

  return createProblemResponse(response.status, {
    detail: parsed.success ? parsed.data.message : undefined,
    errorCode: parsed.success ? parsed.data.code : undefined,
    headers: response.headers,
  });
}

export function problemDetailsPlugin(
  options: ProblemDetailsPluginOptions = {},
): BetterAuthPlugin {
  const disabledPaths = new Set(options.disabledPaths ?? []);

  return {
    id: 'work-os-problem-details',
    // Better Auth의 built-in disabledPaths는 onResponse 전에 반환하므로 여기서 차단해 오류 형식을 유지한다.
    async onRequest(request, context) {
      const requestPath = new URL(request.url).pathname;
      const basePath = new URL(context.baseURL).pathname.replace(/\/$/, '');
      const isAuthPath =
        requestPath === basePath || requestPath.startsWith(`${basePath}/`);
      const relativePath = isAuthPath
        ? requestPath.slice(basePath.length) || '/'
        : requestPath;

      if (!disabledPaths.has(relativePath)) return;
      return { response: createProblemResponse(404) };
    },
    async onResponse(response) {
      const converted = await toProblemDetailsResponse(response);
      if (converted !== response) return { response: converted };
    },
  };
}
