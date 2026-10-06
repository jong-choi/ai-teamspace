import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { getProblemDetails } from '@repo/client/api-client/runtime';
import {
  type CalendarAvailabilityResponse,
  type CalendarRescheduleAvailabilityRequest,
  CalendarRescheduleAvailabilityRequest as CalendarRescheduleAvailabilityRequestSchema,
  type MeetingDetail,
  type MeetingRoom,
  type RescheduleMeeting,
  RescheduleMeeting as RescheduleMeetingSchema,
} from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Input } from '@repo/client/rnr/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { useCalendarRescheduleAvailabilityPreview } from '@core/features/calendar/calendar-availability-mutations';
import { useRescheduleCalendarMeeting } from '@core/features/calendar/calendar-scheduling-mutations';
import { CalendarAvailabilityStatus } from '@core/features/calendar/components/calendar-availability-status';
import {
  calendarLocalScheduleToInstants,
  dateKeyInTimeZone,
} from '@core/features/calendar/lib/calendar-time-zone';
import { formatInstantTime } from '@core/features/calendar/lib/calendar-format';

const rescheduleScopes = RescheduleMeetingSchema.shape.scope.unwrap().options;

type RescheduleScope = NonNullable<RescheduleMeeting['scope']>;
type LocationType = RescheduleMeeting['locationType'];

const locationOptions: readonly { label: string; value: LocationType }[] = [
  { label: '온라인', value: 'online' },
  { label: '회의실', value: 'meeting_room' },
  { label: '기타 장소', value: 'other' },
];

export function CalendarRescheduleDialog({
  meeting,
  onOpenChange,
  open,
  organizationId,
  rooms,
}: {
  meeting: MeetingDetail;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  rooms: readonly MeetingRoom[];
}) {
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const [dateKey, setDateKey] = useState(
    dateKeyInTimeZone(meeting.startAt, meeting.timeZone),
  );
  const [startTime, setStartTime] = useState(
    formatInstantTime(meeting.startAt, meeting.timeZone),
  );
  const [endTime, setEndTime] = useState(
    formatInstantTime(meeting.endAt, meeting.timeZone),
  );
  const [timeZone, setTimeZone] = useState(meeting.timeZone);
  const [locationType, setLocationType] = useState<LocationType>(
    meeting.locationType,
  );
  const [meetingRoomId, setMeetingRoomId] = useState<string | null>(
    meeting.meetingRoomId,
  );
  const [locationText, setLocationText] = useState(meeting.locationText ?? '');
  const [scope, setScope] = useState<RescheduleScope>('single');
  const [formError, setFormError] = useState<string | null>(null);
  const [availabilityResult, setAvailabilityResult] =
    useState<CalendarAvailabilityResponse | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );
  const availabilityRequestSequence = useRef(0);
  const availability = useCalendarRescheduleAvailabilityPreview(
    organizationId,
    meeting.id,
  );
  const mutation = useRescheduleCalendarMeeting(
    organizationId,
    meeting.id,
    () => {
      notifySuccess({
        title: '회의 일정을 변경했습니다.',
        description: meeting.title,
      });
      onOpenChange(false);
    },
  );

  useEffect(() => {
    if (!open) return;
    setDateKey(dateKeyInTimeZone(meeting.startAt, meeting.timeZone));
    setStartTime(formatInstantTime(meeting.startAt, meeting.timeZone));
    setEndTime(formatInstantTime(meeting.endAt, meeting.timeZone));
    setTimeZone(meeting.timeZone);
    setLocationType(meeting.locationType);
    setMeetingRoomId(meeting.meetingRoomId);
    setLocationText(meeting.locationText ?? '');
    setScope('single');
    setFormError(null);
    setAvailabilityResult(null);
    setAvailabilityError(null);
  }, [meeting, open]);

  const participantLabels = useMemo(() => {
    const labels = new Map<string, string>();
    labels.set(meeting.organizer.id, meeting.organizer.name);
    for (const attendee of meeting.attendees) {
      labels.set(attendee.user.id, attendee.user.name);
    }
    return labels;
  }, [meeting.attendees, meeting.organizer]);

  useEffect(() => {
    if (!open) return;
    const input = buildAvailabilityInput({
      dateKey,
      endTime,
      locationType,
      meetingRoomId,
      startTime,
      timeZone,
    });
    const sequence = availabilityRequestSequence.current + 1;
    availabilityRequestSequence.current = sequence;
    setAvailabilityResult(null);
    setAvailabilityError(null);
    if (!input) return;

    const timer = setTimeout(() => {
      void availability
        .previewAvailability(input)
        .then((result) => {
          if (availabilityRequestSequence.current === sequence) {
            setAvailabilityResult(result);
          }
        })
        .catch((error: unknown) => {
          if (availabilityRequestSequence.current !== sequence) return;
          const problem = getProblemDetails(error);
          setAvailabilityError(
            problem?.detail ?? '변경할 일정의 충돌 여부를 확인하지 못했습니다.',
          );
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [
    availability.previewAvailability,
    dateKey,
    endTime,
    locationType,
    meetingRoomId,
    open,
    startTime,
    timeZone,
  ]);

  const submit = async () => {
    setFormError(null);
    if (locationType === 'meeting_room' && !meetingRoomId) {
      setFormError('회의실을 선택해 주세요.');
      return;
    }
    if (locationType === 'other' && !locationText.trim()) {
      setFormError('장소를 입력해 주세요.');
      return;
    }
    if (availabilityResult && !availabilityResult.available) {
      setFormError('일정 충돌을 해결한 뒤 변경해 주세요.');
      return;
    }

    let input: RescheduleMeeting;
    try {
      const schedule = calendarLocalScheduleToInstants(
        dateKey,
        startTime,
        endTime,
        timeZone,
      );
      input = RescheduleMeetingSchema.parse({
        ...schedule,
        timeZone,
        locationType,
        meetingRoomId: locationType === 'meeting_room' ? meetingRoomId : null,
        locationText: locationType === 'other' ? locationText.trim() : null,
        scope: meeting.recurrence ? scope : 'single',
      });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : '변경할 일정 값을 확인해 주세요.',
      );
      return;
    }

    try {
      await mutation.rescheduleMeeting(input);
    } catch (error) {
      const problem = getProblemDetails(error);
      if (problem?.status === 409 || problem?.status === 400) {
        setFormError(problem.detail ?? '선택한 일정으로 변경할 수 없습니다.');
        return;
      }
      notifyError({
        title: '회의 일정을 변경하지 못했습니다.',
        description: problem?.detail ?? '잠시 후 다시 시도해 주세요.',
      });
    }
  };

  const activeRooms = rooms.filter((room) => room.active);
  const submitBlocked =
    mutation.isPending ||
    availability.isPending ||
    availabilityResult?.available === false;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[92vh] max-w-lg">
        <DialogHeader className="border-b border-border pb-3">
          <DialogTitle className="text-sm">회의 일정 변경</DialogTitle>
          <DialogDescription className="text-xs">
            기존 회의의 시간과 장소를 변경합니다. 참석 응답은 유지됩니다.
          </DialogDescription>
        </DialogHeader>

        <ScrollView
          className="max-h-[68vh]"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4 pr-1">
            <View className="gap-3 sm:flex-row">
              <Field label="날짜">
                <Input
                  className="h-9 font-mono text-xs"
                  onChangeText={setDateKey}
                  value={dateKey}
                />
              </Field>
              <Field label="시작">
                <Input
                  className="h-9 font-mono text-xs"
                  onChangeText={setStartTime}
                  value={startTime}
                />
              </Field>
              <Field label="종료">
                <Input
                  className="h-9 font-mono text-xs"
                  onChangeText={setEndTime}
                  value={endTime}
                />
              </Field>
            </View>

            <Field label="Timezone">
              <Input
                className="h-9 font-mono text-xs"
                onChangeText={setTimeZone}
                value={timeZone}
              />
            </Field>

            <View className="gap-3 sm:flex-row">
              <View className="flex-1">
                <Field label="장소 유형">
                  <Select
                    onValueChange={(option) => {
                      const value = option?.value;
                      if (!value || !isLocationType(value)) return;
                      setLocationType(value);
                      if (value !== 'meeting_room') setMeetingRoomId(null);
                    }}
                    value={{
                      label:
                        locationOptions.find(
                          (item) => item.value === locationType,
                        )?.label ?? '온라인',
                      value: locationType,
                    }}
                  >
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue placeholder="장소 유형" />
                    </SelectTrigger>
                    <SelectContent side="bottom">
                      {locationOptions.map((item) => (
                        <SelectItem
                          key={item.value}
                          label={item.label}
                          value={item.value}
                        >
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </View>
              {locationType === 'meeting_room' ? (
                <View className="flex-1">
                  <Field label="회의실">
                    <Select
                      onValueChange={(option) =>
                        setMeetingRoomId(option?.value ?? null)
                      }
                      value={
                        meetingRoomId
                          ? {
                              label:
                                activeRooms.find(
                                  (room) => room.id === meetingRoomId,
                                )?.name ??
                                meeting.meetingRoom?.name ??
                                '회의실',
                              value: meetingRoomId,
                            }
                          : undefined
                      }
                    >
                      <SelectTrigger className="w-full" size="sm">
                        <SelectValue placeholder="회의실 선택" />
                      </SelectTrigger>
                      <SelectContent side="bottom">
                        {activeRooms.map((room) => (
                          <SelectItem
                            key={room.id}
                            label={room.name}
                            value={room.id}
                          >
                            {room.name} · {room.capacity}인
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </View>
              ) : locationType === 'other' ? (
                <View className="flex-1">
                  <Field label="장소">
                    <Input
                      className="h-9 text-xs"
                      onChangeText={setLocationText}
                      placeholder="장소 또는 주소"
                      value={locationText}
                    />
                  </Field>
                </View>
              ) : null}
            </View>

            {meeting.recurrence ? (
              <View className="gap-2 rounded-lg border border-border bg-muted/20 p-3">
                <Text className="text-[11px] font-semibold">
                  반복 일정 적용 범위
                </Text>
                <Text className="text-[10px] text-muted-foreground">
                  반복 규칙 자체는 유지하고 선택한 일정의 변경 범위만
                  지정합니다.
                </Text>
                <Select
                  onValueChange={(option) => {
                    const value = option?.value;
                    if (value && isRescheduleScope(value)) setScope(value);
                  }}
                  value={{ label: rescheduleScopeLabel(scope), value: scope }}
                >
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue placeholder="변경 범위" />
                  </SelectTrigger>
                  <SelectContent side="bottom">
                    {rescheduleScopes.map((item) => (
                      <SelectItem
                        key={item}
                        label={rescheduleScopeLabel(item)}
                        value={item}
                      >
                        {rescheduleScopeLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </View>
            ) : null}

            <CalendarAvailabilityStatus
              errorMessage={availabilityError}
              participantLabels={participantLabels}
              pending={availability.isPending}
              result={availabilityResult}
              timeZone={timeZone}
            />

            {formError ? (
              <View className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                <Text className="text-xs text-rose-600 dark:text-rose-400">
                  {formError}
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <DialogFooter className="border-t border-border pt-3">
          <Button
            disabled={mutation.isPending}
            onPress={() => onOpenChange(false)}
            variant="ghost"
          >
            <Text>취소</Text>
          </Button>
          <Button disabled={submitBlocked} onPress={() => void submit()}>
            <Text className="text-primary-foreground">
              {mutation.isPending
                ? '변경 중...'
                : availability.isPending
                  ? '일정 확인 중...'
                  : '일정 변경'}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text className="text-[11px] font-semibold text-muted-foreground">
        {label}
      </Text>
      {children}
    </View>
  );
}

function buildAvailabilityInput(input: {
  dateKey: string;
  endTime: string;
  locationType: LocationType;
  meetingRoomId: string | null;
  startTime: string;
  timeZone: string;
}): CalendarRescheduleAvailabilityRequest | null {
  if (input.locationType === 'meeting_room' && !input.meetingRoomId)
    return null;
  try {
    const schedule = calendarLocalScheduleToInstants(
      input.dateKey,
      input.startTime,
      input.endTime,
      input.timeZone,
    );
    return CalendarRescheduleAvailabilityRequestSchema.parse({
      ...schedule,
      timeZone: input.timeZone,
      meetingRoomId:
        input.locationType === 'meeting_room' ? input.meetingRoomId : null,
    });
  } catch {
    return null;
  }
}

function isLocationType(value: string): value is LocationType {
  return locationOptions.some((option) => option.value === value);
}

function isRescheduleScope(value: string): value is RescheduleScope {
  return rescheduleScopes.some((scope) => scope === value);
}

function rescheduleScopeLabel(scope: RescheduleScope): string {
  if (scope === 'series') return '반복 일정 전체';
  if (scope === 'future') return '이후 일정';
  return '이번 일정';
}
