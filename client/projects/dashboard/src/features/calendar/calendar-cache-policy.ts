import {
  getCalendarControllerGetMeetingQueryKey,
  getCalendarControllerListMeetingsQueryKey,
} from '@repo/client/api-client';
import type { MeetingDetail } from '@repo/client/api-client/schemas';

import type { QueryClient } from '@tanstack/react-query';

export function setCalendarMeetingDetail(
  queryClient: QueryClient,
  organizationId: string,
  meeting: MeetingDetail,
): void {
  queryClient.setQueryData(
    getCalendarControllerGetMeetingQueryKey(organizationId, meeting.id),
    meeting,
  );
}

export async function invalidateCalendarRanges(
  queryClient: QueryClient,
  organizationId: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: getCalendarControllerListMeetingsQueryKey(organizationId),
  });
}
