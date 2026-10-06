import { useCallback } from 'react';

import {
  useCalendarControllerPreviewAvailability,
  useCalendarControllerPreviewRescheduleAvailability,
} from '@repo/client/api-client';
import type {
  CalendarAvailabilityRequest,
  CalendarRescheduleAvailabilityRequest,
} from '@repo/client/api-client/schemas';

export function useCalendarAvailabilityPreview(organizationId: string) {
  const mutation = useCalendarControllerPreviewAvailability();
  const previewAvailability = useCallback(
    (input: CalendarAvailabilityRequest) =>
      mutation.mutateAsync({ organizationId, data: input }),
    [mutation.mutateAsync, organizationId],
  );
  return { ...mutation, previewAvailability };
}

export function useCalendarRescheduleAvailabilityPreview(
  organizationId: string,
  meetingId: string,
) {
  const mutation = useCalendarControllerPreviewRescheduleAvailability();
  const previewAvailability = useCallback(
    (input: CalendarRescheduleAvailabilityRequest) =>
      mutation.mutateAsync({ organizationId, meetingId, data: input }),
    [meetingId, mutation.mutateAsync, organizationId],
  );
  return { ...mutation, previewAvailability };
}
