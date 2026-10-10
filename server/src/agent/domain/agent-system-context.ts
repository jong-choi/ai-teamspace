import { z } from 'zod';

/** 클라이언트가 run configurable에 실어 보내는 화면 맥락 key다. */
export const AGENT_CLIENT_CONTEXT_CONFIGURABLE_KEY = 'client_context';

const AGENT_SYSTEM_CONTEXT_TAG = 'system_context';
const FALLBACK_TIME_ZONE = 'UTC';
const MAX_VALUE_LENGTH = 200;
const MAX_PARAMS = 12;

const AgentClientContextSchema = z.object({
  timeZone: z.string().min(1).max(64).optional(),
  route: z.string().min(1).max(MAX_VALUE_LENGTH).optional(),
  params: z
    .record(z.string().min(1).max(64), z.string().max(MAX_VALUE_LENGTH))
    .optional(),
});

export type AgentClientContext = z.infer<typeof AgentClientContextSchema>;

export interface AgentSystemContextInput {
  user: { id: string; name?: string };
  organization: { id: string; name?: string };
  client: AgentClientContext;
  now: Date;
}

/**
 * run configurable에서 화면 맥락을 읽는다.
 * 모델에게 주는 참고 정보라 형식이 맞지 않으면 run을 막지 않고 버린다.
 */
export function resolveAgentClientContext(
  configurable: Record<string, unknown> | undefined,
): AgentClientContext {
  const parsed = AgentClientContextSchema.safeParse(
    configurable?.[AGENT_CLIENT_CONTEXT_CONFIGURABLE_KEY],
  );
  return parsed.success ? parsed.data : {};
}

/** 사용자 메시지 앞에 붙일 `<system_context>` 블록을 만든다. */
export function renderAgentSystemContext(
  input: AgentSystemContextInput,
): string {
  const timeZone = resolveTimeZone(input.client.timeZone);
  const local = formatLocalInstant(input.now, timeZone);
  const params = Object.entries(input.client.params ?? {})
    .filter(([, value]) => value.length > 0)
    .slice(0, MAX_PARAMS)
    .map(([key, value]) => `${oneLine(key)}=${oneLine(value)}`);

  const lines = [
    `current_time: ${local.instant} (${local.weekday})`,
    `time_zone: ${timeZone}`,
    `user: ${labelWithId(input.user.name, input.user.id)}`,
    `organization: ${labelWithId(input.organization.name, input.organization.id)}`,
    ...(input.client.route ? [`screen: ${oneLine(input.client.route)}`] : []),
    ...(params.length > 0 ? [`screen_params: ${params.join(', ')}`] : []),
  ];

  return [
    `<${AGENT_SYSTEM_CONTEXT_TAG}>`,
    ...lines,
    `</${AGENT_SYSTEM_CONTEXT_TAG}>`,
  ].join('\n');
}

/**
 * run input의 마지막 사용자 메시지 앞에 맥락 블록을 붙인다.
 * 블록이 붙은 메시지가 그대로 thread에 남아야 이후 turn의 prompt prefix가 바뀌지 않는다.
 * 사용자 메시지가 없는 input(HITL resume 등)은 그대로 돌려준다.
 */
export function withAgentSystemContext<T>(input: T, context: string): T {
  if (!isRecord(input) || !Array.isArray(input['messages'])) return input;

  const messages: unknown[] = input['messages'];
  const lastHumanIndex = messages.findLastIndex(isHumanMessage);
  if (lastHumanIndex < 0) return input;

  return {
    ...input,
    messages: messages.map((message, index) => {
      if (!isHumanMessage(message)) return message;
      const content = neutralizeContent(message['content']);
      return {
        ...message,
        content:
          index === lastHumanIndex ? prependContext(content, context) : content,
      };
    }),
  };
}

function prependContext(content: unknown, context: string): unknown {
  if (typeof content === 'string') return `${context}\n\n${content}`;
  if (Array.isArray(content))
    return [{ type: 'text', text: context }, ...(content as unknown[])];
  return content;
}

/** 사용자가 직접 입력한 tag가 서버 블록처럼 읽히지 않게 한다. */
function neutralizeContent(content: unknown): unknown {
  if (typeof content === 'string') return neutralizeTag(content);
  if (!Array.isArray(content)) return content;
  return content.map((block: unknown) =>
    isRecord(block) &&
    block['type'] === 'text' &&
    typeof block['text'] === 'string'
      ? { ...block, text: neutralizeTag(block['text']) }
      : block,
  );
}

function neutralizeTag(text: string): string {
  return text.replace(
    new RegExp(`<(/?)${AGENT_SYSTEM_CONTEXT_TAG}>`, 'gi'),
    `&lt;$1${AGENT_SYSTEM_CONTEXT_TAG}&gt;`,
  );
}

function isHumanMessage(message: unknown): message is Record<string, unknown> {
  if (!isRecord(message)) return false;
  return (
    message['type'] === 'human' ||
    message['role'] === 'user' ||
    message['role'] === 'human'
  );
}

function resolveTimeZone(timeZone: string | undefined): string {
  if (!timeZone) return FALLBACK_TIME_ZONE;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions()
      .timeZone;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

/** 사용자 time zone의 벽시계 시각을 offset이 붙은 ISO 8601로 만든다. */
function formatLocalInstant(
  now: Date,
  timeZone: string,
): { instant: string; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
    timeZoneName: 'longOffset',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  // longOffset은 'GMT+09:00' 형태이고 UTC는 offset 없이 'GMT'다.
  const offset = part('timeZoneName').replace('GMT', '') || '+00:00';

  return {
    instant: `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}${offset}`,
    weekday: part('weekday'),
  };
}

function labelWithId(name: string | undefined, id: string): string {
  const label = name ? oneLine(name) : '';
  return label ? `${label} (id: ${oneLine(id)})` : `(id: ${oneLine(id)})`;
}

/** 이름이나 주소 값이 블록의 줄 구조나 tag를 깨지 못하게 한 줄로 만든다. */
function oneLine(value: string): string {
  return value
    .replace(/[\p{Cc}<>]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_VALUE_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
