import { useLocalSearchParams } from 'expo-router';

import { CalendarRoute } from '@core/features/calendar/calendar-route';

export default function CalendarIndexRoute() {
  const params = useLocalSearchParams<{
    meetingId?: string | string[];
  }>();
  return <CalendarRoute initialMeetingId={firstParam(params.meetingId)} />;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
