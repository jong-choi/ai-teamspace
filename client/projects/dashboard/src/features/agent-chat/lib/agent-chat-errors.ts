export type AgentChatErrorKind =
  | 'unauthenticated'
  | 'organization_required'
  | 'thread_not_found_or_forbidden'
  | 'run_conflict'
  | 'interrupted_requires_decision'
  | 'model_provider_failure'
  | 'mcp_unavailable'
  | 'tool_error'
  | 'stream_disconnected'
  | 'reconnect_failed'
  | 'cancel_unknown'
  | 'internal';

export type AgentChatErrorContext =
  'thread' | 'run' | 'hitl' | 'stream' | 'reconnect' | 'cancel';

export type AgentChatErrorPresentation = {
  kind: AgentChatErrorKind;
  title: string;
  description: string;
};

const knownCodeKinds: Readonly<Record<string, AgentChatErrorKind>> = {
  unauthenticated: 'unauthenticated',
  organization_required: 'organization_required',
  thread_not_found: 'thread_not_found_or_forbidden',
  thread_forbidden: 'thread_not_found_or_forbidden',
  run_conflict: 'run_conflict',
  thread_busy: 'run_conflict',
  thread_status_mismatch: 'run_conflict',
  idempotency_key_in_flight: 'run_conflict',
  interrupted_requires_decision: 'interrupted_requires_decision',
  model_provider_failure: 'model_provider_failure',
  mcp_unavailable: 'mcp_unavailable',
  tool_error: 'tool_error',
  stream_disconnected: 'stream_disconnected',
  reconnect_failed: 'reconnect_failed',
  cancel_unknown: 'cancel_unknown',
};

export function mapAgentChatError(
  error: unknown,
  context: AgentChatErrorContext,
): AgentChatErrorPresentation {
  const status = getNumericProperty(error, 'status');
  const code = getStableCode(error);
  const kind =
    (code ? knownCodeKinds[code] : undefined) ??
    kindFromStatus(status) ??
    fallbackKind(context);

  return presentationForKind(kind);
}

function getStableCode(error: unknown): string | null {
  const directCode = getStringProperty(error, 'code');
  if (directCode) return directCode;

  const text = getStringProperty(error, 'text');
  if (!text) return null;

  try {
    const parsed: unknown = JSON.parse(text);
    return getStringProperty(parsed, 'code');
  } catch {
    return null;
  }
}

function kindFromStatus(status: number | null): AgentChatErrorKind | null {
  if (status === 401) return 'unauthenticated';
  if (status === 403 || status === 404) {
    return 'thread_not_found_or_forbidden';
  }
  if (status === 409 || status === 422) return 'run_conflict';
  return null;
}

function fallbackKind(context: AgentChatErrorContext): AgentChatErrorKind {
  if (context === 'stream') return 'stream_disconnected';
  if (context === 'reconnect') return 'reconnect_failed';
  if (context === 'cancel') return 'cancel_unknown';
  return 'internal';
}

function presentationForKind(
  kind: AgentChatErrorKind,
): AgentChatErrorPresentation {
  switch (kind) {
    case 'unauthenticated':
      return {
        kind,
        title: '로그인이 필요합니다',
        description: '세션을 다시 확인한 뒤 Agent 대화를 열어 주세요.',
      };
    case 'organization_required':
      return {
        kind,
        title: '활성 조직이 필요합니다',
        description: '조직을 선택한 뒤 Agent 작업을 다시 요청해 주세요.',
      };
    case 'thread_not_found_or_forbidden':
      return {
        kind,
        title: 'Agent 대화를 열 수 없습니다',
        description:
          '이 대화에 접근할 수 없거나 현재 조직에 속한 대화가 아닙니다. 대화 목록에서 다시 선택해 주세요.',
      };
    case 'run_conflict':
      return {
        kind,
        title: '이미 실행 중인 작업이 있습니다',
        description:
          '현재 Agent 실행이 끝나거나 중지된 뒤 다시 요청해 주세요. 요청은 자동 재시도되지 않았습니다.',
      };
    case 'interrupted_requires_decision':
      return {
        kind,
        title: '사용자 결정이 필요합니다',
        description:
          '대기 중인 Agent 작업을 승인하거나 거절한 뒤 계속해 주세요.',
      };
    case 'model_provider_failure':
      return {
        kind,
        title: '모델 응답을 받지 못했습니다',
        description:
          '현재 실행 상태를 확인한 뒤 새 요청으로 다시 시도해 주세요.',
      };
    case 'mcp_unavailable':
      return {
        kind,
        title: '업무 도구에 연결할 수 없습니다',
        description:
          'Agent의 MCP 연결 상태를 확인한 뒤 다시 시도해 주세요. 요청은 자동 재시도되지 않았습니다.',
      };
    case 'tool_error':
      return {
        kind,
        title: 'Agent 도구 작업이 실패했습니다',
        description:
          '실행 결과를 확인한 뒤 필요한 경우 새 요청으로 다시 시도해 주세요.',
      };
    case 'stream_disconnected':
      return {
        kind,
        title: 'Agent 연결이 끊어졌습니다',
        description: '잠시 후 다시 시도해주세요.',
      };
    case 'reconnect_failed':
      return {
        kind,
        title: 'Agent 실행에 다시 연결하지 못했습니다',
        description: '대화의 최신 상태를 다시 열어 확인해 주세요.',
      };
    case 'cancel_unknown':
      return {
        kind,
        title: '중지 결과를 확인할 수 없습니다',
        description:
          '서버에서 실행이 계속 중일 수 있습니다. 최신 실행 상태를 확인한 뒤 다음 작업을 진행해 주세요.',
      };
    case 'internal':
      return {
        kind,
        title: 'Agent 요청을 처리하지 못했습니다',
        description:
          '현재 상태를 확인한 뒤 다시 시도해 주세요. 요청은 자동 재시도되지 않았습니다.',
      };
  }
}

function getStringProperty(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : null;
}

function getNumericProperty(value: unknown, key: string): number | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? candidate
    : null;
}
