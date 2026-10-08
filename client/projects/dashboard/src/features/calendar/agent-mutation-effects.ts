import { getCalendarControllerGetMeetingQueryKey } from '@repo/client/api-client';
import type {
  CalendarMeetingMutationReceiptOutput,
  CalendarMeetingRsvpMutationReceiptOutput,
} from '@repo/client/api-client/schemas';
import { invalidateCalendarRanges } from '@core/features/calendar/calendar-cache-policy';

import type { QueryClient } from '@tanstack/react-query';

// Agent가 회의를 만들거나 바꾸거나 취소했을 때 열려 있는 일정 범위와 회의 상세를 다시 불러온다.
export async function applyCalendarAgentMutation(
  queryClient: QueryClient,
  receipt:
    | CalendarMeetingMutationReceiptOutput
    | CalendarMeetingRsvpMutationReceiptOutput,
): Promise<void> {
  await Promise.all([
    invalidateCalendarRanges(queryClient, receipt.organizationId),
    queryClient.invalidateQueries({
      queryKey: getCalendarControllerGetMeetingQueryKey(
        receipt.organizationId,
        receipt.resourceId,
      ),
    }),
  ]);
}
