import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentMutationReceiptOutput } from '@repo/client/api-client/schemas';
import { applyAgentMutationEffect } from '@core/features/agent-chat/mutation-effects/agent-mutation-effect-registry';
import { decodeAgentMutationReceipt } from '@core/features/agent-chat/mutation-effects/decode-agent-mutation-receipt';

import type { ToolCallWithResult } from '@langchain/langgraph-sdk';
import { useQueryClient } from '@tanstack/react-query';

export type AgentMutationEffectFailure = {
  key: string;
  receipt: AgentMutationReceiptOutput;
};

/**
 * 새로 완료된 Work OS write 도구의 영수증을 도구 단위로 즉시 화면 cache에 반영한다.
 * - hydration 시점에 이미 끝나 있던 도구는 기준선으로 처리 완료 표시만 한다.
 * - `threadId:toolCallId`로 한 번만 처리하고, 실패는 자동 재시도하지 않는다.
 */
export function useAgentMutationEffects({
  hydrated,
  organizationId,
  threadId,
  toolCalls,
}: {
  hydrated: boolean;
  organizationId: string;
  threadId: string;
  toolCalls: readonly ToolCallWithResult[];
}) {
  const queryClient = useQueryClient();
  const processed = useRef(new Set<string>());
  const inFlight = useRef(new Set<string>());
  const baselineTaken = useRef(false);
  const [failures, setFailures] = useState<AgentMutationEffectFailure[]>([]);

  useEffect(() => {
    if (!hydrated) return;

    if (!baselineTaken.current) {
      baselineTaken.current = true;
      for (const tool of toolCalls) {
        if (tool.state !== 'pending') {
          processed.current.add(`${threadId}:${tool.id}`);
        }
      }
      return;
    }

    for (const tool of toolCalls) {
      const key = `${threadId}:${tool.id}`;
      if (tool.state === 'pending') continue;
      if (processed.current.has(key) || inFlight.current.has(key)) continue;

      const receipt = decodeAgentMutationReceipt(tool, organizationId);
      if (!receipt) {
        processed.current.add(key);
        continue;
      }

      inFlight.current.add(key);
      applyAgentMutationEffect(queryClient, receipt)
        .catch(() => {
          setFailures((current) => [...current, { key, receipt }]);
        })
        .finally(() => {
          inFlight.current.delete(key);
          processed.current.add(key);
        });
    }
  }, [hydrated, organizationId, queryClient, threadId, toolCalls]);

  const retry = useCallback(async () => {
    const pending = failures;
    setFailures([]);
    const results = await Promise.allSettled(
      pending.map((failure) =>
        applyAgentMutationEffect(queryClient, failure.receipt),
      ),
    );
    const stillFailing = pending.filter(
      (_, index) => results[index]?.status === 'rejected',
    );
    if (stillFailing.length > 0) {
      setFailures((current) => [...current, ...stillFailing]);
    }
  }, [failures, queryClient]);

  return { failures, retry };
}
