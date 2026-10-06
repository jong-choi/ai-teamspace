import { ScrollView, View } from 'react-native';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import { useCalendarMeetingDetail } from '@core/features/calendar/calendar-query';
import { CalendarMarkdownEditor } from '@core/features/calendar/components/calendar-markdown-editor';
import { CALENDAR_CATEGORY_META } from '@core/features/calendar/lib/calendar-category';
import { formatInstantDateTimeRange } from '@core/features/calendar/lib/calendar-datetime';
import { getMeetingLocationLabel } from '@core/features/calendar/lib/calendar-meeting';

import {
  CalendarClock,
  MapPin,
  Monitor,
  UserRound,
  Users,
} from 'lucide-react-native';

export function CalendarMeetingDetailDialog({
  meetingId,
  onOpenChange,
  open,
  organizationId,
}: {
  meetingId: string | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] max-w-lg">
        {meetingId ? (
          <DashboardQueryBoundary
            errorFallbackClassName="min-h-72"
            fallback={
              <DashboardLoading
                className="min-h-72"
                label="회의 상세를 불러오는 중..."
              />
            }
            resetKeys={[organizationId, meetingId]}
            title="회의 상세를 불러오지 못했습니다"
          >
            <MeetingDetailContent
              meetingId={meetingId}
              organizationId={organizationId}
            />
          </DashboardQueryBoundary>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MeetingDetailContent({
  meetingId,
  organizationId,
}: {
  meetingId: string;
  organizationId: string;
}) {
  const meeting = useCalendarMeetingDetail(organizationId, meetingId).data;
  const meta = CALENDAR_CATEGORY_META[meeting.category];
  const location = getMeetingLocationLabel(meeting);

  return (
    <ScrollView className="max-h-[76vh]" showsVerticalScrollIndicator={false}>
      <View className="gap-4 pr-1">
        <DialogHeader className="border-b border-border pb-3">
          <View className="flex-row items-center gap-2">
            <View
              className={cn(
                'rounded-full border px-2 py-0.5',
                meta.badgeClassName,
              )}
            >
              <Text
                className={cn('text-xs font-semibold', meta.badgeTextClassName)}
              >
                {meta.label}
              </Text>
            </View>
            <Text className="font-mono text-xs text-muted-foreground">
              {formatInstantDateTimeRange(
                meeting.startAt,
                meeting.endAt,
                meeting.timeZone,
              )}
            </Text>
          </View>
          <DialogTitle className="pr-8 text-base leading-6">
            {meeting.title}
          </DialogTitle>
          <Text className="text-[10px] text-muted-foreground">
            {meeting.timeZone}
          </Text>
        </DialogHeader>

        <View className="flex-row items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <Icon
              as={meeting.locationType === 'online' ? Monitor : MapPin}
              className="size-4 text-emerald-500"
            />
            <Text
              className="min-w-0 flex-1 text-xs font-medium"
              numberOfLines={1}
            >
              {location}
            </Text>
          </View>
          <View className="rounded-full border border-border bg-background px-2 py-0.5">
            <Text className="text-[11px] font-medium text-muted-foreground">
              {meeting.canceledAt ? '취소됨' : '일정 확정'}
            </Text>
          </View>
        </View>

        <View className="rounded-lg border border-border p-3">
          <View className="mb-2 flex-row items-center gap-1.5">
            <Icon as={UserRound} className="size-3.5 text-muted-foreground" />
            <Text className="text-xs font-semibold">주최자</Text>
          </View>
          <PersonRow
            email={meeting.organizer.email}
            image={meeting.organizer.image}
            name={meeting.organizer.name}
          />
        </View>

        <View className="rounded-lg border border-border p-3">
          <View className="mb-2 flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <Icon as={Users} className="size-3.5 text-muted-foreground" />
              <Text className="text-xs font-semibold">참석자</Text>
            </View>
            <Text className="text-[10px] text-muted-foreground">
              {meeting.attendees.length}명
            </Text>
          </View>
          <View className="gap-2">
            {meeting.attendees.map((attendee) => (
              <View
                className="flex-row items-center justify-between gap-3"
                key={attendee.user.id}
              >
                <View className="min-w-0 flex-1">
                  <PersonRow
                    email={attendee.user.email}
                    image={attendee.user.image}
                    name={attendee.user.name}
                  />
                </View>
                <Text className="text-[10px] text-muted-foreground">
                  {rsvpLabel(attendee.status)}
                </Text>
              </View>
            ))}
            {meeting.attendees.length === 0 ? (
              <Text className="text-xs text-muted-foreground">
                추가 참석자가 없습니다.
              </Text>
            ) : null}
          </View>
        </View>

        <View className="gap-1.5">
          <View className="flex-row items-center gap-1.5">
            <Icon
              as={CalendarClock}
              className="size-3.5 text-muted-foreground"
            />
            <Text className="text-xs font-semibold">회의 안건</Text>
          </View>
          <CalendarMarkdownEditor
            accessibilityLabel="회의 안건 Markdown 보기"
            editable={false}
            placeholder="등록된 안건이 없습니다."
            value={meeting.agendaMarkdown}
          />
        </View>

        <View className="gap-1.5">
          <Text className="text-xs font-semibold">회의록</Text>
          <CalendarMarkdownEditor
            accessibilityLabel="회의록 Markdown 보기"
            editable={false}
            placeholder="기록된 회의록이 없습니다."
            value={meeting.notesMarkdown}
          />
        </View>

        <View className="flex-row items-center justify-between border-t border-border pt-3">
          <Text className="text-[10px] text-muted-foreground">
            연계 프로젝트
          </Text>
          <Text className="text-[10px] font-medium">
            {meeting.project?.name ?? '연계 없음'}
          </Text>
        </View>
      </View>
    </ScrollView>
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
    <View className="min-w-0 flex-row items-center gap-2">
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

function rsvpLabel(status: 'pending' | 'accepted' | 'tentative' | 'declined') {
  if (status === 'accepted') return '수락';
  if (status === 'tentative') return '미정';
  if (status === 'declined') return '불참';
  return '응답 대기';
}
