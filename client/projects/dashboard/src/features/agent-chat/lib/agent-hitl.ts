import { getAgentToolLabel } from '@core/features/agent-chat/lib/agent-tool-display';

import { z } from 'zod';

const decisionSchema = z.enum(['approve', 'edit', 'reject']);

const actionRequestSchema = z.object({
  name: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  description: z.string().optional(),
});

const reviewConfigSchema = z.object({
  actionName: z.string().min(1),
  allowedDecisions: z.array(decisionSchema).min(1),
  argsSchema: z.record(z.string(), z.unknown()).optional(),
});

const hitlRequestSchema = z.object({
  actionRequests: z.array(actionRequestSchema).min(1),
  reviewConfigs: z.array(reviewConfigSchema).min(1),
});

const sensitiveKeyPattern =
  /(?:authorization|cookie|credential|password|passwd|secret|token|api[_-]?key)/iu;

export type AgentHitlDecision = 'approve' | 'reject';

export type AgentHitlPresentation = {
  actions: Array<{
    name: string;
    label: string;
    description: string | null;
    arguments: Array<{ key: string; value: string }>;
    allowedDecisions: Array<'approve' | 'edit' | 'reject'>;
  }>;
  canApproveAll: boolean;
  canRejectAll: boolean;
};

export function parseAgentHitlPresentation(
  value: unknown,
): AgentHitlPresentation | null {
  const parsed = hitlRequestSchema.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.actionRequests.length !== parsed.data.reviewConfigs.length) {
    return null;
  }

  const actions = parsed.data.actionRequests.map((action, index) => {
    const review = parsed.data.reviewConfigs[index];
    if (!review || review.actionName !== action.name) return null;

    return {
      name: action.name,
      label: getAgentToolLabel(action.name),
      description: action.description
        ? truncate(action.description.trim(), 180)
        : null,
      arguments: Object.entries(action.args)
        .slice(0, 4)
        .map(([key, rawValue]) => ({
          key: truncate(key, 40),
          value: sensitiveKeyPattern.test(key)
            ? '••••'
            : formatArgumentValue(rawValue),
        })),
      allowedDecisions: review.allowedDecisions,
    };
  });

  if (actions.some((action) => action === null)) return null;

  const supportedActions = actions.filter(
    (action): action is NonNullable<typeof action> => action !== null,
  );

  return {
    actions: supportedActions,
    canApproveAll: supportedActions.every((action) =>
      action.allowedDecisions.includes('approve'),
    ),
    canRejectAll: supportedActions.every((action) =>
      action.allowedDecisions.includes('reject'),
    ),
  };
}

export function createAgentHitlResume(
  presentation: AgentHitlPresentation,
  decision: AgentHitlDecision,
) {
  if (
    (decision === 'approve' && !presentation.canApproveAll) ||
    (decision === 'reject' && !presentation.canRejectAll)
  ) {
    throw new Error('모든 HITL action에 허용되지 않은 결정입니다.');
  }

  return {
    decisions: presentation.actions.map(() =>
      decision === 'approve'
        ? { type: 'approve' as const }
        : {
            type: 'reject' as const,
            message: '사용자가 Dashboard에서 이 작업을 거절했습니다.',
          },
    ),
  };
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
