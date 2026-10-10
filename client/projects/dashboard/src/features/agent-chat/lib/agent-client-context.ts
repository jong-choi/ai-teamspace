/** run configurable에 화면 맥락을 실어 보내는 key다. 서버의 같은 이름 key와 맞춘다. */
export const AGENT_CLIENT_CONTEXT_CONFIGURABLE_KEY = 'client_context';

const MAX_PARAMS = 12;
const MAX_KEY_LENGTH = 64;
const MAX_VALUE_LENGTH = 200;

export type AgentClientContext = {
  timeZone: string;
  route: string;
  params: Record<string, string>;
};

/**
 * 지금 보고 있는 화면을 서버가 `<system_context>`에 적을 수 있는 형태로 만든다.
 * 주소는 값이 채워진 경로 대신 route pattern과 값으로 나눠 어떤 ID인지 드러낸다.
 */
export function buildAgentClientContext(input: {
  segments: readonly string[];
  params: Record<string, string | string[] | undefined>;
}): AgentClientContext {
  const route = `/${input.segments
    .filter((segment) => !isRouteGroup(segment))
    .join('/')}`.slice(0, MAX_VALUE_LENGTH);
  const params: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input.params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value || key.length > MAX_KEY_LENGTH) continue;
    if (Object.keys(params).length >= MAX_PARAMS) break;
    params[key] = value.slice(0, MAX_VALUE_LENGTH);
  }

  return {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    route,
    params,
  };
}

/** 서버가 사용자 메시지 앞에 붙인 `<system_context>` 블록을 화면에 보일 글에서 뺀다. */
export function stripAgentSystemContext(text: string): string {
  return text.replace(LEADING_SYSTEM_CONTEXT, '');
}

const LEADING_SYSTEM_CONTEXT =
  /^\s*<system_context>[\s\S]*?<\/system_context>\s*/;

// expo-router의 `(workspace)` 같은 group segment는 주소에 나타나지 않는다.
function isRouteGroup(segment: string): boolean {
  return segment.startsWith('(') && segment.endsWith(')');
}
