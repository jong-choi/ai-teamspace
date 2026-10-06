import {
  useCalendarControllerUpdateAgenda,
  useCalendarControllerUpdateMeeting,
  useCalendarControllerUpdateNotes,
} from '@repo/client/api-client';
import type {
  UpdateMeeting,
  UpdateMeetingAgenda,
  UpdateMeetingNotes,
} from '@repo/client/api-client/schemas';
import { setCalendarMeetingDetail } from '@core/features/calendar/calendar-cache-policy';

import { useQueryClient } from '@tanstack/react-query';

export function useCalendarAgendaMutation(
  organizationId: string,
  meetingId: string,
) {
  const queryClient = useQueryClient();
  const mutation = useCalendarControllerUpdateAgenda({
    mutation: {
      onSuccess: (meeting) =>
        setCalendarMeetingDetail(queryClient, organizationId, meeting),
    },
  });
  return {
    ...mutation,
    updateAgenda: (input: UpdateMeetingAgenda) =>
      mutation.mutateAsync({ organizationId, meetingId, data: input }),
  };
}

export function useCalendarNotesMutation(
  organizationId: string,
  meetingId: string,
) {
  const queryClient = useQueryClient();
  const mutation = useCalendarControllerUpdateNotes({
    mutation: {
      onSuccess: (meeting) =>
        setCalendarMeetingDetail(queryClient, organizationId, meeting),
    },
  });
  return {
    ...mutation,
    updateNotes: (input: UpdateMeetingNotes) =>
      mutation.mutateAsync({ organizationId, meetingId, data: input }),
  };
}

export function useCalendarMetadataMutation(
  organizationId: string,
  meetingId: string,
) {
  const queryClient = useQueryClient();
  const mutation = useCalendarControllerUpdateMeeting({
    mutation: {
      onSuccess: (meeting) =>
        setCalendarMeetingDetail(queryClient, organizationId, meeting),
    },
  });
  return {
    ...mutation,
    updateMeeting: (input: UpdateMeeting) =>
      mutation.mutateAsync({ organizationId, meetingId, data: input }),
  };
}
