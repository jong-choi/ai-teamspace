import { z } from 'zod';

const CREDENTIAL_QUERY_KEY =
  /(?:^|[_-])(access[_-]?token|api[_-]?key|authorization|auth|bearer|credential|password|secret|token)(?:$|[_-])/i;

export const AgentMcpEndpointSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value, context) => {
    let endpoint: URL;
    try {
      endpoint = new URL(value);
    } catch {
      context.addIssue({
        code: 'custom',
        message: '외부 MCP endpoint는 유효한 절대 URL이어야 합니다.',
      });
      return z.NEVER;
    }

    if (endpoint.protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        message: '외부 MCP endpoint는 HTTPS를 사용해야 합니다.',
      });
    }

    if (endpoint.username !== '' || endpoint.password !== '') {
      context.addIssue({
        code: 'custom',
        message: '외부 MCP endpoint URL에 credential을 포함할 수 없습니다.',
      });
    }

    if (endpoint.hash !== '') {
      context.addIssue({
        code: 'custom',
        message: '외부 MCP endpoint URL에 fragment를 포함할 수 없습니다.',
      });
    }

    for (const key of endpoint.searchParams.keys()) {
      if (CREDENTIAL_QUERY_KEY.test(key)) {
        context.addIssue({
          code: 'custom',
          message:
            '외부 MCP endpoint URL의 query에 credential을 포함할 수 없습니다.',
        });
        break;
      }
    }

    return endpoint.toString();
  });
