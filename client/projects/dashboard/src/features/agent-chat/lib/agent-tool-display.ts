const MAX_FIELD_VALUE_LENGTH = 160;
const MAX_RESULT_SUMMARY_LENGTH = 220;
const MAX_VISIBLE_FIELDS = 4;

const sensitiveKeyPattern =
  /(?:authorization|bearer|cookie|credential|header|password|passwd|secret|token|api[_-]?key)/iu;
const technicalKeyPattern =
  /(?:receipt|querykey|cachekey|correlation|trace|span|revision|mutation)/iu;
const inlineSecretPattern =
  /\b(?:authorization|bearer|cookie|password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/giu;

const fieldLabels = {
  title: '제목',
  name: '이름',
  query: '검색어',
  status: '상태',
  role: '역할',
  description: '설명',
  content: '내용',
  message: '메시지',
  startAt: '시작',
  endAt: '종료',
  startsAt: '시작',
  endsAt: '종료',
  dueAt: '마감',
  dueDate: '마감',
  date: '날짜',
  location: '장소',
  targetStatus: '변경 상태',
  rsvpStatus: '응답',
} as const;

type DisplayFieldKey = keyof typeof fieldLabels;

const toolLabels: Record<string, string> = {
  organizations_list: '조직 목록 확인',
  organization_members_list: '조직 멤버 확인',
  organization_invitation_create: '조직 초대 생성',
  chat_conversations_list: '대화 목록 확인',
  chat_messages_list: '메시지 확인',
  chat_message_send: '메시지 전송',
  wiki_search: '위키 검색',
  wiki_document_get: '위키 문서 확인',
  wiki_document_create: '위키 문서 생성',
  wiki_document_update: '위키 문서 수정',
  projects_list: '프로젝트 목록 확인',
  project_get: '프로젝트 확인',
  project_columns_list: '업무 단계 확인',
  project_ticket_get: '업무 확인',
  project_ticket_create: '업무 생성',
  project_ticket_update: '업무 수정',
  project_ticket_move: '업무 이동',
  calendar_availability_check: '일정 가능 시간 확인',
  calendar_meetings_list: '회의 목록 확인',
  calendar_meeting_get: '회의 확인',
  calendar_meeting_create: '회의 생성',
  calendar_meeting_reschedule: '회의 일정 변경',
  calendar_meeting_rsvp: '회의 참석 응답',
  calendar_meeting_cancel: '회의 취소',
};

export type AgentToolDisplayField = {
  label: string;
  value: string;
};

export type AgentToolDisplay = {
  label: string;
  fields: AgentToolDisplayField[];
  resultSummary: string | null;
};

export type AgentToolSource =
  | { kind: 'workos' }
  | { kind: 'external'; namespace: string }
  | { kind: 'agent' };

// Deep Agent 내장 도구(계획, 파일, 하위 Agent 위임)의 사용자용 이름이다.
const agentToolLabels: Record<string, string> = {
  write_todos: '작업 계획 정리',
  task: '하위 Agent 위임',
  ls: '작업 파일 목록 확인',
  read_file: '작업 파일 읽기',
  write_file: '작업 파일 쓰기',
  edit_file: '작업 파일 수정',
  glob: '작업 파일 찾기',
  grep: '작업 파일 검색',
};

const externalToolNamePattern = /^([a-z][a-z0-9]{0,31})__.+$/u;
const permissionDeniedPattern =
  /(?:forbidden|permission|not allowed|insufficient[_ ]scope|권한)/iu;

export function getAgentToolLabel(name: string): string {
  return toolLabels[name] ?? agentToolLabels[name] ?? '외부 도구 작업';
}

export function getAgentToolSource(name: string): AgentToolSource {
  if (toolLabels[name]) return { kind: 'workos' };
  if (agentToolLabels[name]) return { kind: 'agent' };
  const external = externalToolNamePattern.exec(name);
  if (external?.[1]) return { kind: 'external', namespace: external[1] };
  return { kind: 'external', namespace: '외부' };
}

export function isAgentToolPermissionDenied(text: string): boolean {
  return permissionDeniedPattern.test(text);
}

export function projectAgentToolDisplay(input: {
  name: string;
  args: unknown;
  result: unknown;
  structured?: unknown;
}): AgentToolDisplay {
  // write 도구의 structured 결과는 {result, mutation}이다. 화면에는 result만 요약한다.
  const structured =
    isRecord(input.structured) && 'mutation' in input.structured
      ? input.structured['result']
      : input.structured;

  return {
    label: getAgentToolLabel(input.name),
    fields: projectFields(input.args),
    resultSummary:
      structured === undefined
        ? projectResultSummary(input.result)
        : (projectResultSummary(structured) ??
          projectResultSummary(input.result)),
  };
}

function projectFields(value: unknown): AgentToolDisplayField[] {
  if (!isRecord(value)) return [];

  const fields: AgentToolDisplayField[] = [];
  for (const key of Object.keys(fieldLabels) as DisplayFieldKey[]) {
    if (!(key in value)) continue;
    if (sensitiveKeyPattern.test(key) || technicalKeyPattern.test(key))
      continue;

    const formatted = formatSafeValue(value[key], MAX_FIELD_VALUE_LENGTH);
    if (!formatted) continue;

    fields.push({
      label: fieldLabels[key],
      value: formatted,
    });
    if (fields.length >= MAX_VISIBLE_FIELDS) break;
  }

  return fields;
}

function projectResultSummary(value: unknown): string | null {
  if (value == null) return null;

  if (typeof value === 'string') {
    return formatSafeText(value, MAX_RESULT_SUMMARY_LENGTH);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return '목록 ' + value.length + '개';
  }

  if (!isRecord(value)) return null;

  const summaryKeys: DisplayFieldKey[] = [
    'title',
    'name',
    'status',
    'description',
    'message',
  ];
  for (const key of summaryKeys) {
    if (!(key in value)) continue;
    if (sensitiveKeyPattern.test(key) || technicalKeyPattern.test(key))
      continue;
    const formatted = formatSafeValue(value[key], MAX_RESULT_SUMMARY_LENGTH);
    if (formatted) return fieldLabels[key] + ': ' + formatted;
  }

  const count = inferCollectionCount(value);
  return count === null ? null : '결과 ' + count + '개';
}

function inferCollectionCount(value: Record<string, unknown>): number | null {
  for (const candidate of Object.values(value)) {
    if (Array.isArray(candidate)) return candidate.length;
  }
  return null;
}

function formatSafeValue(value: unknown, maxLength: number): string | null {
  if (typeof value === 'string') return formatSafeText(value, maxLength);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return '목록 ' + value.length + '개';
  if (value instanceof Date) return value.toISOString();
  return null;
}

function formatSafeText(value: string, maxLength: number): string {
  const sanitized = value
    .replace(inlineSecretPattern, (match) => {
      const separatorIndex = Math.max(match.indexOf(':'), match.indexOf('='));
      return separatorIndex >= 0
        ? match.slice(0, separatorIndex + 1) + ' ••••'
        : '••••';
    })
    .replace(/\s+/gu, ' ')
    .trim();

  if (sanitized.length <= maxLength) return sanitized;
  return sanitized.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
