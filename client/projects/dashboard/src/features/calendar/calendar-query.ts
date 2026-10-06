import {
  getCalendarControllerGetMeetingQueryKey,
  getCalendarControllerListMeetingsQueryKey,
  useCalendarControllerCreateMeeting,
  useCalendarControllerGetMeetingSuspense,
  useCalendarControllerListMeetingRoomsSuspense,
  useCalendarControllerListMeetingsSuspense,
  useOrganizationsControllerGetActiveSuspense,
  useOrganizationsControllerListMembersSuspense,
} from '@repo/client/api-client';
import type {
  CreateMeeting,
  MeetingDetail,
  MeetingList,
  MeetingRoomList,
  OrganizationAccess,
  OrganizationMemberList,
} from '@repo/client/api-client/schemas';
import type { CalendarCategory } from '@core/features/calendar/lib/calendar-category';

import { useQueryClient } from '@tanstack/react-query';

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

export function useCreateCalendarMeeting(
  organizationId: string,
  onCreated: (meeting: MeetingDetail) => void,
) {
  const queryClient = useQueryClient();
  const mutation = useCalendarControllerCreateMeeting({
    mutation: {
      onSuccess: async (meeting) => {
        queryClient.setQueryData(
          getCalendarControllerGetMeetingQueryKey(organizationId, meeting.id),
          meeting,
        );
        await queryClient.invalidateQueries({
          queryKey: getCalendarControllerListMeetingsQueryKey(organizationId),
        });
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
