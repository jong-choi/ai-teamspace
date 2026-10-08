import { z } from 'zod';

const JSON_RPC_INVALID_PARAMS = -32_602;

const toolCallMessageSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.literal('tools/call'),
  params: z.object({ arguments: z.unknown().optional() }),
});

/**
 * `tools/call` arguments의 array item과 object property 수가 상한을 넘으면 거부한다.
 *
 * MCP SDK는 handler 호출 전에 tool input schema로 arguments 전체를 검증하므로, 큰 배열이나
 * 깊은 구조를 이용한 schema bomb은 SDK dispatch 전에 막아야 한다. body 크기는 Node adapter가
 * 이미 `maxRequestBodyBytes`로 제한한다.
 */
export async function rejectOversizedToolInput(
  request: Request,
  maxElements: number,
): Promise<Response | undefined> {
  if (request.method !== 'POST') return undefined;

  const message = toolCallMessageSchema.safeParse(await readJsonBody(request));
  if (
    !message.success ||
    !exceedsElementLimit(message.data.params.arguments, maxElements)
  ) {
    return undefined;
  }

  return Response.json(
    {
      jsonrpc: '2.0',
      error: {
        code: JSON_RPC_INVALID_PARAMS,
        message: `MCP tool 입력 element 수가 상한 ${maxElements}을 넘었습니다.`,
      },
      id: message.data.id ?? null,
    },
    { status: 400 },
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch (error) {
    // 잘못된 JSON은 MCP SDK가 JSON-RPC parse error로 응답한다.
    // undici가 다른 realm의 SyntaxError를 던질 수 있어 name으로 판정한다.
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'SyntaxError'
    ) {
      return undefined;
    }
    throw error;
  }
}

function exceedsElementLimit(value: unknown, maxElements: number): boolean {
  let count = 0;
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current !== 'object' || current === null) continue;

    const children = Array.isArray(current) ? current : Object.values(current);
    count += children.length;
    if (count > maxElements) return true;
    pending.push(...children);
  }
  return false;
}
