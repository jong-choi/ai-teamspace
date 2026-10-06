import { useCallback } from 'react';

import {
  getCalendarControllerExportIcsSuspenseQueryOptions,
  getCalendarControllerGetMeetingQueryKey,
  getCalendarControllerListMeetingsQueryKey,
  useCalendarControllerCancelMeeting,
  useCalendarControllerCreateMeeting,
  useCalendarControllerGetMeetingSuspense,
  useCalendarControllerListMeetingRoomsSuspense,
  useCalendarControllerListMeetingsSuspense,
  useCalendarControllerPreviewAvailability,
  useCalendarControllerPreviewRescheduleAvailability,
  useCalendarControllerRescheduleMeeting,
  useCalendarControllerUpdateAgenda,
  useCalendarControllerUpdateMeeting,
  useCalendarControllerUpdateNotes,
  useCalendarControllerUpdateRsvp,
  useOrganizationsControllerGetActiveSuspense,
  useOrganizationsControllerListMembersSuspense,
} from '@repo/client/api-client';
import type {
  CalendarAvailabilityRequest,
  CalendarRescheduleAvailabilityRequest,
  CancelMeeting,
  CreateMeeting,
  MeetingDetail,
  MeetingList,
  MeetingRoomList,
  OrganizationAccess,
  OrganizationMemberList,
  RescheduleMeeting,
  RsvpMeeting,
  UpdateMeeting,
  UpdateMeetingAgenda,
  UpdateMeetingNotes,
} from '@repo/client/api-client/schemas';
import type { CalendarCategory } from '@core/features/calendar/lib/calendar-category';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';

export function useCalendarActiveOrganization() {
  return useOrganizationsControllerGetActiveSuspense<OrganizationAccess | null>(
    {
      query: {
        select: (response) => response.activeOrganization,
      },
    },
  );
}

export function useCalendarMeetings(
  organizationId: string,
  input: {
    from: string;
    to: string;
    category: CalendarCategory | 'all';
    roomId?: string;
    search: string;
  },
) {
  const search = input.search.trim();
  return useCalendarControllerListMeetingsSuspense<MeetingList>(
    organizationId,
    {
      from: input.from,
      to: input.to,
      category: input.category === 'all' ? undefined : input.category,
      roomId: input.roomId,
      search: search.length > 0 ? search : undefined,
    },
  );
}

export function useCalendarRooms(organizationId: string) {
  return useCalendarControllerListMeetingRoomsSuspense<MeetingRoomList>(
    organizationId,
  );
}

export function useCalendarMeetingDetail(
  organizationId: string,
  meetingId: string,
) {
  return useCalendarControllerGetMeetingSuspense<MeetingDetail>(
    organizationId,
    meetingId,
  );
}

export function useCalendarMembers(organizationId: string, search: string) {
  const normalizedSearch = search.trim();
  return useOrganizationsControllerListMembersSuspense<OrganizationMemberList>(
    organizationId,
    {
      limit: 100,
      offset: 0,
      search: normalizedSearch.length > 0 ? normalizedSearch : undefined,
    },
  );
}

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

function setCalendarMeetingDetail(
  queryClient: QueryClient,
  organizationId: string,
  meeting: MeetingDetail,
): void {
  queryClient.setQueryData(
    getCalendarControllerGetMeetingQueryKey(organizationId, meeting.id),
    meeting,
  );
}

async function invalidateCalendarRanges(
  queryClient: QueryClient,
  organizationId: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: getCalendarControllerListMeetingsQueryKey(organizationId),
  });
}
