import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type {
  MeetingRoom,
  MeetingSummary,
} from '@repo/client/api-client/schemas';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { DIALOG_WIDTH } from '@core/app/ui/dialog-width';
import type { CalendarCreateRequest } from '@core/features/calendar/components/calendar-create-dialog';
import { CALENDAR_CATEGORY_META } from '@core/features/calendar/lib/calendar-category';
import { formatDateKeyLabel } from '@core/features/calendar/lib/calendar-format';
import {
  type CalendarRoomSlot,
  createRoomTimelineSlots,
  ROOM_TIMELINE_END_HOUR,
  ROOM_TIMELINE_START_HOUR,
  roomTimelineMeetingLabel,
} from '@core/features/calendar/lib/calendar-room-timeline';

import {
  Building2,
  CalendarDays,
  Clock3,
  Plus,
  Users,
} from 'lucide-react-native';

export function CalendarRoomsDialog({
  currentDateKey,
  meetings,
  onCreateMeeting,
  onOpenChange,
  open,
  rooms,
  timeZone,
}: {
  currentDateKey: string;
  meetings: readonly MeetingSummary[];
  onCreateMeeting: (request: CalendarCreateRequest) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  rooms: readonly MeetingRoom[];
  timeZone: string;
}) {
  const slotsByRoom = useMemo(
    () =>
      new Map(
        rooms.map((room) => [
          room.id,
          createRoomTimelineSlots(meetings, room.id, currentDateKey, timeZone),
        ]),
      ),
    [currentDateKey, meetings, rooms, timeZone],
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={cn('max-h-[92vh]', DIALOG_WIDTH['4xl'])}>
        <DialogHeader className="border-b border-border pb-3">
          <View className="flex-row items-center gap-2.5">
            <View className="size-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Icon as={Building2} className="size-4 text-emerald-500" />
            </View>
            <View className="min-w-0 flex-1">
              <DialogTitle>회의실 현황 및 타임라인</DialogTitle>
            </View>
            <View className="hidden flex-row items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 sm:flex">
              <Icon as={CalendarDays} className="size-3.5 text-emerald-500" />
              <Text className="text-[11px] font-medium">
                {formatDateKeyLabel(currentDateKey)}
              </Text>
            </View>
          </View>
        </DialogHeader>

        <ScrollView
          className="max-h-[70vh]"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-5 py-1">
            <View className="gap-3 sm:flex-row sm:flex-wrap">
              {rooms.map((room) => {
                const reservationCount = meetings.filter(
                  (meeting) =>
                    !meeting.canceledAt && meeting.meetingRoomId === room.id,
                ).length;
                const slots = slotsByRoom.get(room.id) ?? [];
                const firstAvailableSlot = slots.find(
                  (slot) => slot.busyMeetings.length === 0,
                );
                return (
                  <View
                    className="gap-2.5 rounded-xl border border-border bg-card p-3.5 shadow-sm shadow-black/5 sm:w-[48%] lg:w-[23%]"
                    key={room.id}
                  >
                    <View className="flex-row items-start justify-between gap-2">
                      <Text
                        className="min-w-0 flex-1 text-xs font-bold"
                        numberOfLines={2}
                      >
                        {room.name}
                      </Text>
                      <View className="flex-row items-center gap-1 rounded-full border border-border px-2 py-0.5">
                        <View
                          className={`size-1.5 rounded-full ${room.active ? 'bg-emerald-500' : 'bg-zinc-400'}`}
                        />
                        <Text className="text-[9px] font-medium text-muted-foreground">
                          {room.active
                            ? `예약 ${reservationCount}건`
                            : '비활성'}
                        </Text>
                      </View>
                    </View>
                    <View className="gap-1">
                      <View className="flex-row items-center gap-1.5">
                        <Icon
                          as={Users}
                          className="size-3 text-muted-foreground"
                        />
                        <Text className="text-[11px] text-muted-foreground">
                          {room.capacity}인
                          {room.floor ? ` · ${room.floor}` : ''}
                        </Text>
                      </View>
                      {room.description ? (
                        <Text
                          className="text-[10px] leading-4 text-muted-foreground"
                          numberOfLines={2}
                        >
                          {room.description}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      accessibilityLabel={`${room.name} 회의 예약`}
                      className="items-center rounded-md bg-muted py-1.5 web:hover:bg-accent"
                      disabled={!room.active || !firstAvailableSlot}
                      onPress={() => {
                        if (!firstAvailableSlot) return;
                        onCreateMeeting({
                          dateKey: currentDateKey,
                          startTime: firstAvailableSlot.startTime,
                          endTime: firstAvailableSlot.endTime,
                          meetingRoomId: room.id,
                        });
                        onOpenChange(false);
                      }}
                    >
                      <Text className="text-xs font-medium">
                        {!room.active
                          ? '예약 불가'
                          : firstAvailableSlot
                            ? `${firstAvailableSlot.startTime}부터 예약`
                            : '빈 시간 없음'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
              {rooms.length === 0 ? (
                <View className="flex-1 items-center rounded-xl border border-dashed border-border py-12">
                  <Icon
                    as={Building2}
                    className="size-6 text-muted-foreground"
                  />
                  <Text className="mt-2 text-xs text-muted-foreground">
                    등록된 회의실이 없습니다.
                  </Text>
                </View>
              ) : null}
            </View>

            {rooms.length > 0 ? (
              <View className="gap-3 rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/5">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-row items-center gap-2">
                    <Icon as={Clock3} className="size-4 text-emerald-500" />
                    <Text className="text-xs font-bold">
                      회의실 타임라인 (
                      {String(ROOM_TIMELINE_START_HOUR).padStart(2, '0')}:00–
                      {ROOM_TIMELINE_END_HOUR}:00)
                    </Text>
                  </View>
                  <Text className="text-[10px] text-muted-foreground">
                    빈 슬롯을 누르면 예약 창을 엽니다.
                  </Text>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="min-w-[820px] gap-1.5">
                    <View className="ml-32 w-[720px] flex-row items-center justify-between">
                      {Array.from(
                        {
                          length:
                            ROOM_TIMELINE_END_HOUR -
                            ROOM_TIMELINE_START_HOUR +
                            1,
                        },
                        (_, index) => ROOM_TIMELINE_START_HOUR + index,
                      ).map((hour) => (
                        <Text
                          className="font-mono text-[9px] text-muted-foreground"
                          key={hour}
                        >
                          {String(hour).padStart(2, '0')}:00
                        </Text>
                      ))}
                    </View>

                    {rooms.map((room) => (
                      <RoomTimelineRow
                        currentDateKey={currentDateKey}
                        key={room.id}
                        onCreateMeeting={(request) => {
                          onCreateMeeting(request);
                          onOpenChange(false);
                        }}
                        room={room}
                        slots={slotsByRoom.get(room.id) ?? []}
                        timeZone={timeZone}
                      />
                    ))}
                  </View>
                </ScrollView>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </DialogContent>
    </Dialog>
  );
}

function RoomTimelineRow({
  currentDateKey,
  onCreateMeeting,
  room,
  slots,
  timeZone,
}: {
  currentDateKey: string;
  onCreateMeeting: (request: CalendarCreateRequest) => void;
  room: MeetingRoom;
  slots: readonly CalendarRoomSlot[];
  timeZone: string;
}) {
  return (
    <View className="flex-row items-stretch">
      <View className="w-32 justify-center border-r border-border pr-3">
        <Text className="text-[10px] font-semibold" numberOfLines={1}>
          {room.name}
        </Text>
        <Text className="text-[9px] text-muted-foreground">
          {room.capacity}인{room.floor ? ` · ${room.floor}` : ''}
        </Text>
      </View>
      {slots.map((slot) => {
        const meeting = slot.busyMeetings[0] ?? null;
        const meta = meeting ? CALENDAR_CATEGORY_META[meeting.category] : null;
        const busy = meeting !== null;
        return (
          <Pressable
            accessibilityLabel={
              busy
                ? `${room.name} ${slot.startTime} 예약됨`
                : `${room.name} ${slot.startTime} 회의 예약`
            }
            className={cn(
              'h-11 w-20 border-r border-border/60 px-1 py-1',
              busy ? 'bg-muted/30' : 'web:hover:bg-muted/40',
            )}
            disabled={busy || !room.active}
            key={`${room.id}-${slot.hour}`}
            onPress={() =>
              onCreateMeeting({
                dateKey: currentDateKey,
                startTime: slot.startTime,
                endTime: slot.endTime,
                meetingRoomId: room.id,
              })
            }
          >
            {meeting && meta ? (
              <View
                className={cn(
                  'h-full justify-center rounded border px-1.5',
                  meta.chipClassName,
                )}
              >
                <Text
                  className={cn(
                    'text-[8px] font-semibold',
                    meta.chipTextClassName,
                  )}
                  numberOfLines={2}
                >
                  {roomTimelineMeetingLabel(meeting, timeZone)}
                </Text>
              </View>
            ) : (
              <View className="h-full items-center justify-center rounded">
                <Icon as={Plus} className="size-3 text-muted-foreground/60" />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
