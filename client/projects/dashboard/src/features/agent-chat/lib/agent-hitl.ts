import { getAgentToolLabel } from '@core/features/agent-chat/lib/agent-tool-display';

import { z } from 'zod';

const decisionTypeSchema = z.enum(['approve', 'edit', 'reject']);

const actionRequestSchema = z.object({
  name: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  description: z.string().optional(),
});

const reviewConfigSchema = z.object({
  actionName: z.string().min(1),
  allowedDecisions: z.array(decisionTypeSchema).min(1),
  argsSchema: z.record(z.string(), z.unknown()).optional(),
});

const hitlRequestSchema = z.object({
  actionRequests: z.array(actionRequestSchema).min(1),
  reviewConfigs: z.array(reviewConfigSchema).min(1),
});

const sensitiveKeyPattern =
  /(?:authorization|cookie|credential|password|passwd|secret|token|api[_-]?key)/iu;

// 거절 ToolMessage를 대화 흐름에서 "거부됨"으로 구분하기 위한 접두사다.
export const AGENT_HITL_REJECT_PREFIX = '사용자가 이 작업을 거절했습니다.';

export type AgentHitlDecisionType = z.infer<typeof decisionTypeSchema>;

export type AgentHitlAction = {
  name: string;
  label: string;
  description: string | null;
  arguments: Array<{ key: string; value: string }>;
  rawArgs: Record<string, unknown>;
  argsSchema: Record<string, unknown> | null;
  allowedDecisions: AgentHitlDecisionType[];
};

export type AgentHitlPresentation = {
  actions: AgentHitlAction[];
};

export type AgentHitlDecisionDraft = {
  type: AgentHitlDecisionType;
  editedArgsText: string;
  rejectMessage: string;
};

export type AgentHitlResumeDecision =
  | { type: 'approve' }
  | {
      type: 'edit';
      editedAction: { name: string; args: Record<string, unknown> };
    }
  | { type: 'reject'; message: string };

export type AgentHitlResumeResult =
  | { ok: true; resume: { decisions: AgentHitlResumeDecision[] } }
  | { ok: false; errors: Record<number, string> };

export function parseAgentHitlPresentation(
  value: unknown,
): AgentHitlPresentation | null {
  const parsed = hitlRequestSchema.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.actionRequests.length !== parsed.data.reviewConfigs.length) {
    return null;
  }

  const actions: AgentHitlAction[] = [];
  for (const [index, action] of parsed.data.actionRequests.entries()) {
    const review = parsed.data.reviewConfigs[index];
    if (!review || review.actionName !== action.name) return null;

    actions.push({
      name: action.name,
      label: getAgentToolLabel(action.name),
      description: action.description
        ? truncate(action.description.trim(), 180)
        : null,
      arguments: Object.entries(action.args)
        .slice(0, 6)
        .map(([key, rawValue]) => ({
          key: truncate(key, 40),
          value: sensitiveKeyPattern.test(key)
            ? '••••'
            : formatArgumentValue(rawValue),
        })),
      rawArgs: action.args,
      argsSchema: review.argsSchema ?? null,
      allowedDecisions: review.allowedDecisions,
    });
  }

  return { actions };
}

// 여러 interrupt가 동시에 걸리면 action을 하나의 목록으로 합친다. 하나라도 해석할 수 없으면 null이다.
export function parseAgentHitlInterrupts(
  values: readonly unknown[],
): AgentHitlPresentation | null {
  if (values.length !== 1) return null;
  return parseAgentHitlPresentation(values[0]);
}

export function createDefaultAgentHitlDrafts(
  presentation: AgentHitlPresentation,
): AgentHitlDecisionDraft[] {
  return presentation.actions.map((action) => ({
    type: action.allowedDecisions[0] ?? 'approve',
    editedArgsText: JSON.stringify(redactArgs(action.rawArgs), null, 2),
    rejectMessage: '',
  }));
}

export function createAgentHitlResume(
  presentation: AgentHitlPresentation,
  drafts: readonly AgentHitlDecisionDraft[],
): AgentHitlResumeResult {
  if (drafts.length !== presentation.actions.length) {
    return { ok: false, errors: { 0: '모든 작업의 결정을 선택해 주세요.' } };
  }

  const errors: Record<number, string> = {};
  const decisions: AgentHitlResumeDecision[] = [];

  presentation.actions.forEach((action, index) => {
    const draft = drafts[index];
    if (!draft || !action.allowedDecisions.includes(draft.type)) {
      errors[index] = '이 작업에 허용되지 않은 결정입니다.';
      return;
    }

    if (draft.type === 'approve') {
      decisions.push({ type: 'approve' });
      return;
    }

    if (draft.type === 'reject') {
      const reason = draft.rejectMessage.trim();
      decisions.push({
        type: 'reject',
        message: reason
          ? `${AGENT_HITL_REJECT_PREFIX} 사유: ${truncate(reason, 500)}`
          : AGENT_HITL_REJECT_PREFIX,
      });
      return;
    }

    const edited = parseEditedArgs(draft.editedArgsText, action);
    if (!edited.ok) {
      errors[index] = edited.error;
      return;
    }
    decisions.push({
      type: 'edit',
      editedAction: { name: action.name, args: edited.args },
    });
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, resume: { decisions } };
}

function parseEditedArgs(
  text: string,
  action: AgentHitlAction,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: '인자는 올바른 JSON이어야 합니다.' };
  }

  const record = z.record(z.string(), z.unknown()).safeParse(parsed);
  if (!record.success) {
    return { ok: false, error: '인자는 JSON 객체여야 합니다.' };
  }

  // 가려서 보여 준 secret 값은 원래 값으로 되돌린다. 사용자가 secret을 직접 볼 수 없게 하기 위함이다.
  const args = restoreRedactedArgs(record.data, action.rawArgs);

  if (action.argsSchema) {
    let schema: z.ZodType;
    try {
      schema = z.fromJSONSchema(action.argsSchema);
    } catch {
      return { ok: false, error: '이 작업의 인자 형식을 해석할 수 없습니다.' };
    }
    const result = schema.safeParse(args);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.join('.') ?? '';
      return {
        ok: false,
        error: path
          ? `인자 "${path}"가 올바르지 않습니다.`
          : '인자 형식이 올바르지 않습니다.',
      };
    }
  }

  return { ok: true, args };
}

function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      sensitiveKeyPattern.test(key) ? '••••' : value,
    ]),
  );
}

function restoreRedactedArgs(
  edited: Record<string, unknown>,
  original: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(edited).map(([key, value]) => [
      key,
      sensitiveKeyPattern.test(key) && value === '••••' ? original[key] : value,
    ]),
  );
}

function formatArgumentValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return truncate(value, 80);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return `[목록 ${value.length}개]`;
  if (typeof value === 'object') return '[복합 값]';
  return '[표시할 수 없는 값]';
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}
