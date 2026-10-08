import type { AgentMutationReceiptOutput } from '@repo/client/api-client/schemas';
import { applyCalendarAgentMutation } from '@core/features/calendar/agent-mutation-effects';
import { applyChatMessageAgentMutation } from '@core/features/chat/agent-mutation-effects';
import { applyOrganizationInvitationAgentMutation } from '@core/features/organizations/agent-mutation-effects';
import { applyProjectTicketAgentMutation } from '@core/features/projects/agent-mutation-effects';
import { applyWikiAgentMutation } from '@core/features/wiki/agent-mutation-effects';

import type { QueryClient } from '@tanstack/react-query';

// 영수증 kind별로 해당 feature의 기존 cache 정책만 호출한다. 같은 mutation을 다시 실행하지 않는다.
export function applyAgentMutationEffect(
  queryClient: QueryClient,
  receipt: AgentMutationReceiptOutput,
): Promise<void> {
  switch (receipt.kind) {
    case 'calendar_meeting':
    case 'calendar_meeting_rsvp':
      return applyCalendarAgentMutation(queryClient, receipt);
    case 'project_ticket':
      return applyProjectTicketAgentMutation(queryClient, receipt);
    case 'wiki_document':
      return applyWikiAgentMutation(queryClient, receipt);
    case 'organization_invitation':
      return applyOrganizationInvitationAgentMutation(queryClient, receipt);
    case 'chat_message':
      return applyChatMessageAgentMutation(queryClient, receipt);
  }
}
