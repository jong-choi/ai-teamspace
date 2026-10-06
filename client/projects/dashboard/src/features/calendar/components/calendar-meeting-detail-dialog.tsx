import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import type {
  MeetingDetail,
  MeetingRoom,
} from '@repo/client/api-client/schemas';
import { Dialog, DialogContent } from '@repo/client/rnr/components/ui/dialog';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import { useCalendarMeetingDetail } from '@core/features/calendar/calendar-queries';
import { CalendarMeetingActions } from '@core/features/calendar/components/calendar-meeting-actions';
import {
  CalendarMeetingAgenda,
  CalendarMeetingNotes,
  CalendarMeetingReminder,
} from '@core/features/calendar/components/calendar-meeting-content';
import { CalendarMeetingParticipants } from '@core/features/calendar/components/calendar-meeting-participants';
import { CalendarRescheduleDialog } from '@core/features/calendar/components/calendar-reschedule-dialog';
import { CALENDAR_CATEGORY_META } from '@core/features/calendar/lib/calendar-category';
import { formatInstantDateTimeRange } from '@core/features/calendar/lib/calendar-datetime';
import { getMeetingLocationLabel } from '@core/features/calendar/lib/calendar-meeting';

import { MapPin, Monitor } from 'lucide-react-native';

export function CalendarMeetingDetailDialog({
  currentUserId,
  meetingId,
  onOpenChange,
  open,
  organizationId,
  rooms,
}: {
  currentUserId: string;
  meetingId: string | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  rooms: readonly MeetingRoom[];
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
              currentUserId={currentUserId}
              meetingId={meetingId}
              onClose={() => onOpenChange(false)}
              organizationId={organizationId}
              rooms={rooms}
            />
          </DashboardQueryBoundary>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MeetingDetailContent({
  currentUserId,
  meetingId,
  onClose,
  organizationId,
  rooms,
}: {
  currentUserId: string;
  meetingId: string;
  onClose: () => void;
  organizationId: string;
  rooms: readonly MeetingRoom[];
}) {
  const meeting = useCalendarMeetingDetail(organizationId, meetingId).data;
  const location = getMeetingLocationLabel(meeting);
  const [agendaEditing, setAgendaEditing] = useState(false);
  const [agendaDraft, setAgendaDraft] = useState(meeting.agendaMarkdown);
  const [notesDraft, setNotesDraft] = useState(meeting.notesMarkdown);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  useEffect(
    () => setAgendaDraft(meeting.agendaMarkdown),
    [meeting.agendaMarkdown],
  );
  useEffect(
    () => setNotesDraft(meeting.notesMarkdown),
    [meeting.notesMarkdown],
  );

  return (
    <>
      <ScrollView className="max-h-[76vh]" showsVerticalScrollIndicator={false}>
        <View className={cn('gap-4 pr-1', meeting.canceledAt && 'opacity-70')}>
          <DetailHeader meeting={meeting} />

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
              <Text
                className={cn(
                  'text-[11px] font-medium text-muted-foreground',
                  meeting.canceledAt && 'text-rose-500',
                )}
              >
                {meeting.canceledAt ? '취소됨' : '일정 확정'}
              </Text>
            </View>
          </View>

          {meeting.canceledAt ? (
            <View className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
              <Text className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                이 회의는 취소되었습니다.
              </Text>
              {meeting.cancelReason ? (
                <Text className="mt-1 text-[10px] text-rose-600/80 dark:text-rose-400/80">
                  {meeting.cancelReason}
                </Text>
              ) : null}
            </View>
          ) : null}

          <CalendarMeetingParticipants
            currentUserId={currentUserId}
            meeting={meeting}
            organizationId={organizationId}
          />

          <CalendarMeetingAgenda
            draft={agendaDraft}
            editing={agendaEditing}
            meeting={meeting}
            onChange={setAgendaDraft}
            onEditingChange={setAgendaEditing}
            organizationId={organizationId}
          />

          <CalendarMeetingNotes
            draft={notesDraft}
            meeting={meeting}
            onChange={setNotesDraft}
            organizationId={organizationId}
          />

          <CalendarMeetingReminder
            meeting={meeting}
            organizationId={organizationId}
          />

          <CalendarMeetingActions
            meeting={meeting}
            onClose={onClose}
            onOpenReschedule={() => setRescheduleOpen(true)}
            organizationId={organizationId}
          />
        </View>
      </ScrollView>

      {!meeting.canceledAt ? (
        <CalendarRescheduleDialog
          meeting={meeting}
          onOpenChange={setRescheduleOpen}
          open={rescheduleOpen}
          organizationId={organizationId}
          rooms={rooms}
        />
      ) : null}
    </>
  );
}

function DetailHeader({ meeting }: { meeting: MeetingDetail }) {
  const meta = CALENDAR_CATEGORY_META[meeting.category];
  return (
    <View className="gap-1 border-b border-border pb-3">
      <View className="flex-row items-center gap-2">
        <View
          className={cn('rounded-full border px-2 py-0.5', meta.badgeClassName)}
        >
          <Text
            className={cn('text-xs font-semibold', meta.badgeTextClassName)}
          >
            {meta.label}
          </Text>
        </View>
        <Text className="min-w-0 flex-1 font-mono text-xs text-muted-foreground">
          {formatInstantDateTimeRange(
            meeting.startAt,
            meeting.endAt,
            meeting.timeZone,
          )}
        </Text>
      </View>
      <Text className="pr-8 text-base font-bold leading-6">
        {meeting.title}
      </Text>
      <Text className="text-[10px] text-muted-foreground">
        {meeting.timeZone}
      </Text>
    </View>
  );
}
