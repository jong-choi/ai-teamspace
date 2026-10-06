import { getCalendarControllerExportIcsSuspenseQueryOptions } from '@repo/client/api-client';

import { useQueryClient } from '@tanstack/react-query';

export function useCalendarIcsExport(
  organizationId: string,
  meetingId: string,
) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.fetchQuery(
      getCalendarControllerExportIcsSuspenseQueryOptions(
        organizationId,
        meetingId,
        {
          query: { staleTime: 0 },
        },
      ),
    );
}
