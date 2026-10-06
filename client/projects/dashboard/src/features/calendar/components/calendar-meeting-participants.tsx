import { Pressable, ScrollView, View } from 'react-native';

import { getProblemDetails } from '@repo/client/api-client/runtime';
import {
  type MeetingAttendee,
  type MeetingDetail,
  type RsvpMeeting,
  RsvpMeeting as RsvpMeetingSchema,
} from '@repo/client/api-client/schemas';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { useCalendarRsvp } from '@core/features/calendar/calendar-scheduling-mutations';

const rsvpOptions = RsvpMeetingSchema.shape.status.options;
type RsvpStatus = RsvpMeeting['status'];

export function CalendarMeetingParticipants({
  currentUserId,
  meeting,
  organizationId,
}: {
  currentUserId: string;
  meeting: MeetingDetail;
  organizationId: string;
}) {
  const ownAttendee = meeting.attendees.find(
    (attendee) => attendee.user.id === currentUserId,
  );
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const mutation = useCalendarRsvp(organizationId, meeting.id, () =>
    notifySuccess({ title: '참석 여부를 변경했습니다.' }),
  );

  const updateRsvp = async (status: RsvpStatus) => {
    try {
      await mutation.updateRsvp({ status });
    } catch (error) {
      const problem = getProblemDetails(error);
      notifyError({
        title: '참석 여부를 변경하지 못했습니다.',
        description: problem?.detail ?? '잠시 후 다시 시도해 주세요.',
      });
    }
  };

  return (
    <View className="gap-2 rounded-lg border border-border bg-muted/20 p-3">
      {ownAttendee && !meeting.canceledAt ? (
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs font-semibold">나의 참석 여부</Text>
          <View className="flex-row rounded-md border border-border bg-background p-0.5">
            {rsvpOptions.map((status) => (
              <Pressable
                accessibilityState={{ selected: ownAttendee.status === status }}
                className={cn(
                  'rounded px-2 py-1',
                  ownAttendee.status === status && rsvpStatusBackground(status),
                )}
                disabled={mutation.isPending}
                key={status}
                onPress={() => void updateRsvp(status)}
              >
                <Text
                  className={cn(
                    'text-[10px] font-semibold',
                    rsvpStatusText(status),
                  )}
                >
                  {rsvpLabel(status)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View className="border-t border-border/60 pt-2">
        <Text className="mb-1.5 text-[11px] text-muted-foreground">
          참석자 현황
        </Text>
        <ScrollView className="max-h-32" nestedScrollEnabled>
          <View className="gap-1">
            <PersonStatusRow
              email={meeting.organizer.email}
              image={meeting.organizer.image}
              name={meeting.organizer.name}
              role="주최자"
            />
            {meeting.attendees.map((attendee) => (
              <AttendeeStatusRow attendee={attendee} key={attendee.user.id} />
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function AttendeeStatusRow({ attendee }: { attendee: MeetingAttendee }) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-1">
      <PersonRow
        email={attendee.user.email}
        image={attendee.user.image}
        name={attendee.user.name}
      />
      <View
        className={cn(
          'rounded px-1.5 py-0.5',
          attendeeStatusBackground(attendee.status),
        )}
      >
        <Text
          className={cn(
            'text-[9px] font-medium',
            attendeeStatusText(attendee.status),
          )}
        >
          {attendeeStatusLabel(attendee.status)}
        </Text>
      </View>
    </View>
  );
}

function PersonStatusRow({
  email,
  image,
  name,
  role,
}: {
  email: string;
  image: string | null;
  name: string;
  role: string;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-1">
      <PersonRow email={email} image={image} name={name} />
      <Text className="text-[9px] font-medium text-muted-foreground">
        {role}
      </Text>
    </View>
  );
}

function PersonRow({
  email,
  image,
  name,
}: {
  email: string;
  image: string | null;
  name: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      <Avatar alt={name} className="size-7">
        {image ? <AvatarImage source={{ uri: image }} /> : null}
        <AvatarFallback>
          <Text className="text-[9px] font-semibold">{initials || '?'}</Text>
        </AvatarFallback>
      </Avatar>
      <View className="min-w-0 flex-1">
        <Text className="truncate text-xs font-medium" numberOfLines={1}>
          {name}
        </Text>
        <Text
          className="truncate text-[10px] text-muted-foreground"
          numberOfLines={1}
        >
          {email}
        </Text>
      </View>
    </View>
  );
}

function rsvpLabel(status: RsvpStatus): string {
  if (status === 'accepted') return '수락';
  if (status === 'tentative') return '미정';
  return '불참';
}

function rsvpStatusBackground(status: RsvpStatus): string {
  if (status === 'accepted') return 'bg-emerald-500/10';
  if (status === 'tentative') return 'bg-amber-500/10';
  return 'bg-rose-500/10';
}

function rsvpStatusText(status: RsvpStatus): string {
  if (status === 'accepted') return 'text-emerald-600 dark:text-emerald-400';
  if (status === 'tentative') return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function attendeeStatusLabel(status: MeetingAttendee['status']): string {
  if (status === 'accepted') return '수락됨';
  if (status === 'tentative') return '미정';
  if (status === 'declined') return '불참';
  return '대기';
}

function attendeeStatusBackground(status: MeetingAttendee['status']): string {
  if (status === 'accepted') return 'bg-emerald-500/10';
  if (status === 'tentative') return 'bg-amber-500/10';
  if (status === 'declined') return 'bg-rose-500/10';
  return 'bg-muted';
}

function attendeeStatusText(status: MeetingAttendee['status']): string {
  if (status === 'accepted') return 'text-emerald-600 dark:text-emerald-400';
  if (status === 'tentative') return 'text-amber-600 dark:text-amber-400';
  if (status === 'declined') return 'text-rose-600 dark:text-rose-400';
  return 'text-muted-foreground';
}
