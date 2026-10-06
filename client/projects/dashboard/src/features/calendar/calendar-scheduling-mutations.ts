import {
  useCalendarControllerCancelMeeting,
  useCalendarControllerCreateMeeting,
  useCalendarControllerRescheduleMeeting,
  useCalendarControllerUpdateRsvp,
} from '@repo/client/api-client';
import type {
  CancelMeeting,
  CreateMeeting,
  MeetingDetail,
  RescheduleMeeting,
  RsvpMeeting,
} from '@repo/client/api-client/schemas';
import {
  invalidateCalendarRanges,
  setCalendarMeetingDetail,
} from '@core/features/calendar/calendar-cache-policy';

import { useQueryClient } from '@tanstack/react-query';

export function useCreateCalendarMeeting(
  organizationId: string,
  onCreated: (meeting: MeetingDetail) => void,
) {
  const queryClient = useQueryClient();
  const mutation = useCalendarControllerCreateMeeting({
    mutation: {
      onSuccess: async (meeting) => {
        setCalendarMeetingDetail(queryClient, organizationId, meeting);
        await invalidateCalendarRanges(queryClient, organizationId);
        onCreated(meeting);
      },
    },
  });

  return {
    ...mutation,
    createMeeting: (input: CreateMeeting) =>
      mutation.mutateAsync({ organizationId, data: input }),
  };
}

export function useRescheduleCalendarMeeting(
  organizationId: string,
  meetingId: string,
  onSuccess?: (meeting: MeetingDetail) => void,
) {
  const queryClient = useQueryClient();
  const mutation = useCalendarControllerRescheduleMeeting({
    mutation: {
      onSuccess: async (meeting) => {
        setCalendarMeetingDetail(queryClient, organizationId, meeting);
        await invalidateCalendarRanges(queryClient, organizationId);
        onSuccess?.(meeting);
      },
    },
  });
  return {
    ...mutation,
    rescheduleMeeting: (input: RescheduleMeeting) =>
      mutation.mutateAsync({ organizationId, meetingId, data: input }),
  };
}

export function useCancelCalendarMeeting(
  organizationId: string,
  meetingId: string,
  onSuccess?: (meeting: MeetingDetail) => void,
) {
  const queryClient = useQueryClient();
  const mutation = useCalendarControllerCancelMeeting({
    mutation: {
      onSuccess: async (meeting) => {
        setCalendarMeetingDetail(queryClient, organizationId, meeting);
        await invalidateCalendarRanges(queryClient, organizationId);
        onSuccess?.(meeting);
      },
    },
  });
  return {
    ...mutation,
    cancelMeeting: (input: CancelMeeting) =>
      mutation.mutateAsync({ organizationId, meetingId, data: input }),
  };
}

export function useCalendarRsvp(
  organizationId: string,
  meetingId: string,
  onSuccess?: (meeting: MeetingDetail) => void,
) {
  const queryClient = useQueryClient();
  const mutation = useCalendarControllerUpdateRsvp({
    mutation: {
      onSuccess: (meeting) => {
        setCalendarMeetingDetail(queryClient, organizationId, meeting);
        onSuccess?.(meeting);
      },
    },
  });
  return {
    ...mutation,
    updateRsvp: (input: RsvpMeeting) =>
      mutation.mutateAsync({ organizationId, meetingId, data: input }),
  };
}
