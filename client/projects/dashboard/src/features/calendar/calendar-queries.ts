import {
  useCalendarControllerGetMeetingSuspense,
  useCalendarControllerListMeetingRoomsSuspense,
  useCalendarControllerListMeetingsSuspense,
  useOrganizationsControllerGetActiveSuspense,
} from '@repo/client/api-client';
import type {
  MeetingDetail,
  MeetingList,
  MeetingRoomList,
  OrganizationAccess,
} from '@repo/client/api-client/schemas';
import type { CalendarCategory } from '@core/features/calendar/lib/calendar-category';

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
