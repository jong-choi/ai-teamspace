import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { getProblemDetails } from '@repo/client/api-client/runtime';
import {
  type CalendarAvailabilityRequest,
  CalendarAvailabilityRequest as CalendarAvailabilityRequestSchema,
  type CalendarAvailabilityResponse,
  type CreateMeeting,
  CreateMeeting as CreateMeetingSchema,
  type MeetingDetail,
  type MeetingRoom,
  type OrganizationMember,
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
import { Icon } from '@repo/client/rnr/components/ui/icon';
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
import { useCalendarAvailabilityPreview } from '@core/features/calendar/calendar-availability-mutations';
import { useCreateCalendarMeeting } from '@core/features/calendar/calendar-scheduling-mutations';
import { CalendarAttendeePicker } from '@core/features/calendar/components/calendar-attendee-picker';
import { CalendarAvailabilityStatus } from '@core/features/calendar/components/calendar-availability-status';
import { CalendarMarkdownEditor } from '@core/features/calendar/components/calendar-markdown-editor';
import { CalendarRecurrenceFields } from '@core/features/calendar/components/calendar-recurrence-fields';
import {
  CALENDAR_CATEGORIES,
  CALENDAR_CATEGORY_META,
  type CalendarCategory,
} from '@core/features/calendar/lib/calendar-category';
import { calendarLocalScheduleToInstants } from '@core/features/calendar/lib/calendar-datetime';
import {
  type CalendarRecurrenceDraft,
  createDefaultRecurrenceDraft,
  recurrenceDraftToContract,
} from '@core/features/calendar/lib/calendar-recurrence';

import { Bell, CalendarPlus } from 'lucide-react-native';

export type CalendarCreateRequest = {
  dateKey: string;
  startTime?: string;
  endTime?: string;
  meetingRoomId?: string;
};

type LocationType = CreateMeeting['locationType'];

const locationOptions: readonly { label: string; value: LocationType }[] = [
  { label: '온라인', value: 'online' },
  { label: '회의실', value: 'meeting_room' },
  { label: '기타 장소', value: 'other' },
];

const reminderOptions = [
  { label: '알림 없음', value: 'none' },
  { label: '10분 전', value: '10' },
  { label: '30분 전', value: '30' },
  { label: '1시간 전', value: '60' },
] as const;

export function CalendarCreateDialog({
  currentUserId,
  onCreated,
  onOpenChange,
  open,
  organizationId,
  request,
  rooms,
  timeZone,
}: {
  currentUserId: string;
  onCreated: (meeting: MeetingDetail) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  request: CalendarCreateRequest;
  rooms: readonly MeetingRoom[];
  timeZone: string;
}) {
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CalendarCategory>('team');
  const [dateKey, setDateKey] = useState(request.dateKey);
  const [startTime, setStartTime] = useState(request.startTime ?? '10:00');
  const [endTime, setEndTime] = useState(
    request.endTime ?? nextHour(request.startTime ?? '10:00'),
  );
  const [meetingTimeZone, setMeetingTimeZone] = useState(timeZone);
  const [locationType, setLocationType] = useState<LocationType>(
    request.meetingRoomId ? 'meeting_room' : 'online',
  );
  const [meetingRoomId, setMeetingRoomId] = useState<string | null>(
    request.meetingRoomId ?? null,
  );
  const [locationText, setLocationText] = useState('');
  const [agendaMarkdown, setAgendaMarkdown] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(10);
  const [recurrence, setRecurrence] = useState<CalendarRecurrenceDraft>(
    createDefaultRecurrenceDraft,
  );
  const [selectedMembers, setSelectedMembers] = useState<OrganizationMember[]>(
    [],
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [availabilityResult, setAvailabilityResult] =
    useState<CalendarAvailabilityResponse | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );
  const availabilityRequestSequence = useRef(0);
  const availability = useCalendarAvailabilityPreview(organizationId);
  const mutation = useCreateCalendarMeeting(organizationId, (meeting) => {
    notifySuccess({
      title: '회의를 예약했습니다.',
      description: meeting.title,
    });
    onCreated(meeting);
    onOpenChange(false);
  });

  useEffect(() => {
    if (!open) return;
    const initialStart = request.startTime ?? '10:00';
    setTitle('');
    setCategory('team');
    setDateKey(request.dateKey);
    setStartTime(initialStart);
    setEndTime(request.endTime ?? nextHour(initialStart));
    setMeetingTimeZone(timeZone);
    setLocationType(request.meetingRoomId ? 'meeting_room' : 'online');
    setMeetingRoomId(request.meetingRoomId ?? null);
    setLocationText('');
    setAgendaMarkdown('');
    setReminderMinutes(10);
    setRecurrence(createDefaultRecurrenceDraft());
    setSelectedMembers([]);
    setFormError(null);
    setAvailabilityResult(null);
    setAvailabilityError(null);
  }, [
    open,
    request.dateKey,
    request.endTime,
    request.meetingRoomId,
    request.startTime,
    timeZone,
  ]);

  const activeRooms = rooms.filter((room) => room.active);
  const attendeeUserIds = selectedMembers.map((member) => member.userId);
  const attendeeKey = [...attendeeUserIds].sort().join('|');
  const participantLabels = useMemo(
    () =>
      new Map(
        selectedMembers.map((member) => [member.userId, member.user.name]),
      ),
    [selectedMembers],
  );

  useEffect(() => {
    if (!open) return;
    const input = buildAvailabilityInput({
      attendeeUserIds,
      dateKey,
      endTime,
      locationType,
      meetingRoomId,
      startTime,
      timeZone: meetingTimeZone,
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
            problem?.detail ?? '일정 확인 요청을 완료하지 못했습니다.',
          );
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [
    attendeeKey,
    availability.previewAvailability,
    dateKey,
    endTime,
    locationType,
    meetingRoomId,
    meetingTimeZone,
    open,
    startTime,
  ]);

  const submit = async () => {
    setFormError(null);
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setFormError('회의 제목을 입력해 주세요.');
      return;
    }
    if (locationType === 'meeting_room' && !meetingRoomId) {
      setFormError('회의실을 선택해 주세요.');
      return;
    }
    if (locationType === 'other' && !locationText.trim()) {
      setFormError('장소를 입력해 주세요.');
      return;
    }
    if (availabilityResult && !availabilityResult.available) {
      setFormError('일정 충돌을 해결한 뒤 예약해 주세요.');
      return;
    }

    let input: CreateMeeting;
    try {
      const schedule = calendarLocalScheduleToInstants(
        dateKey,
        startTime,
        endTime,
        meetingTimeZone,
      );
      input = CreateMeetingSchema.parse({
        title: normalizedTitle,
        category,
        ...schedule,
        timeZone: meetingTimeZone,
        locationType,
        meetingRoomId: locationType === 'meeting_room' ? meetingRoomId : null,
        locationText: locationType === 'other' ? locationText.trim() : null,
        projectId: null,
        attendeeUserIds,
        agendaMarkdown,
        reminderMinutes,
        recurrence: recurrenceDraftToContract(
          recurrence,
          meetingTimeZone,
          dateKey,
        ),
      });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : '입력값을 확인해 주세요. 회의 생성 조건에 맞지 않는 값이 있습니다.',
      );
      return;
    }

    try {
      await mutation.createMeeting(input);
    } catch (error) {
      const problem = getProblemDetails(error);
      if (problem?.status === 409 || problem?.status === 400) {
        setFormError(
          problem.detail ?? '선택한 일정으로 회의를 예약할 수 없습니다.',
        );
        return;
      }
      notifyError({
        title: '회의를 예약하지 못했습니다.',
        description: problem?.detail ?? '잠시 후 다시 시도해 주세요.',
      });
    }
  };

  const submitBlocked =
    mutation.isPending ||
    availability.isPending ||
    availabilityResult?.available === false;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[92vh] max-w-lg">
        <DialogHeader className="border-b border-border pb-3">
          <View className="flex-row items-center gap-2">
            <Icon as={CalendarPlus} className="size-4 text-emerald-500" />
            <DialogTitle className="text-sm">새 회의 예약</DialogTitle>
          </View>
          <DialogDescription className="text-xs">
            참여자, 장소와 회의 안건을 지정해 일정을 예약합니다.
          </DialogDescription>
        </DialogHeader>

        <ScrollView
          className="max-h-[68vh]"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4 pr-1">
            <Field label="회의 제목 *">
              <Input
                className="h-9 text-xs"
                onChangeText={setTitle}
                placeholder="예: 제품 주간 싱크"
                value={title}
              />
            </Field>

            <View className="gap-3 sm:flex-row">
              <View className="flex-1">
                <Field label="카테고리">
                  <Select
                    onValueChange={(option) => {
                      const value = option?.value;
                      if (value && isCalendarCategory(value))
                        setCategory(value);
                    }}
                    value={{
                      label: CALENDAR_CATEGORY_META[category].label,
                      value: category,
                    }}
                  >
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue placeholder="카테고리" />
                    </SelectTrigger>
                    <SelectContent side="bottom">
                      {CALENDAR_CATEGORIES.map((item) => (
                        <SelectItem
                          key={item}
                          label={CALENDAR_CATEGORY_META[item].label}
                          value={item}
                        >
                          {CALENDAR_CATEGORY_META[item].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </View>
              <View className="flex-1">
                <Field label="연계 프로젝트">
                  <Input
                    className="h-9 text-xs"
                    editable={false}
                    placeholder="프로젝트 연결 사용 불가"
                  />
                </Field>
              </View>
            </View>

            <View className="gap-3 sm:flex-row">
              <View className="flex-1">
                <Field label="날짜 *">
                  <Input
                    className="h-9 font-mono text-xs"
                    onChangeText={setDateKey}
                    value={dateKey}
                  />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="시작 시간">
                  <Input
                    className="h-9 font-mono text-xs"
                    onChangeText={setStartTime}
                    value={startTime}
                  />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="종료 시간">
                  <Input
                    className="h-9 font-mono text-xs"
                    onChangeText={setEndTime}
                    value={endTime}
                  />
                </Field>
              </View>
            </View>

            <Field label="Timezone">
              <Input
                className="h-9 font-mono text-xs"
                onChangeText={setMeetingTimeZone}
                value={meetingTimeZone}
              />
            </Field>

            <View className="gap-3 sm:flex-row">
              <View className="flex-1">
                <Field label="회의실 / 장소">
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
                                )?.name ?? '회의실',
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

            <CalendarAttendeePicker
              currentUserId={currentUserId}
              onChange={setSelectedMembers}
              organizationId={organizationId}
              selectedMembers={selectedMembers}
            />

            <CalendarAvailabilityStatus
              errorMessage={availabilityError}
              participantLabels={participantLabels}
              pending={availability.isPending}
              result={availabilityResult}
              timeZone={meetingTimeZone}
            />

            <Field label="회의 안건 (Markdown)">
              <CalendarMarkdownEditor
                onChangeText={setAgendaMarkdown}
                placeholder={'- 주요 안건 1\n- 주요 안건 2'}
                value={agendaMarkdown}
              />
            </Field>

            <CalendarRecurrenceFields
              onChange={setRecurrence}
              value={recurrence}
            />

            <View className="flex-row items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <Icon as={Bell} className="size-3.5 text-muted-foreground" />
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-medium">회의 알림</Text>
                <Text className="text-[10px] text-muted-foreground">
                  알림 설정 저장과 실제 알림 전송은 별개입니다.
                </Text>
              </View>
              <View className="w-32">
                <Select
                  onValueChange={(option) =>
                    setReminderMinutes(
                      option?.value && option.value !== 'none'
                        ? Number(option.value)
                        : null,
                    )
                  }
                  value={
                    reminderMinutes === null
                      ? { label: '알림 없음', value: 'none' }
                      : {
                          label:
                            reminderOptions.find(
                              (option) =>
                                option.value === String(reminderMinutes),
                            )?.label ?? `${reminderMinutes}분 전`,
                          value: String(reminderMinutes),
                        }
                  }
                >
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue placeholder="알림" />
                  </SelectTrigger>
                  <SelectContent side="bottom">
                    {reminderOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        label={option.label}
                        value={option.value}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </View>
            </View>

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
                ? '예약 중...'
                : availability.isPending
                  ? '일정 확인 중...'
                  : '예약 완료'}
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
    <View className="gap-1">
      <Text className="text-[11px] font-semibold text-muted-foreground">
        {label}
      </Text>
      {children}
    </View>
  );
}

function buildAvailabilityInput(input: {
  attendeeUserIds: string[];
  dateKey: string;
  endTime: string;
  locationType: LocationType;
  meetingRoomId: string | null;
  startTime: string;
  timeZone: string;
}): CalendarAvailabilityRequest | null {
  if (input.locationType === 'meeting_room' && !input.meetingRoomId)
    return null;
  try {
    const schedule = calendarLocalScheduleToInstants(
      input.dateKey,
      input.startTime,
      input.endTime,
      input.timeZone,
    );
    return CalendarAvailabilityRequestSchema.parse({
      ...schedule,
      timeZone: input.timeZone,
      meetingRoomId:
        input.locationType === 'meeting_room' ? input.meetingRoomId : null,
      attendeeUserIds: input.attendeeUserIds,
    });
  } catch {
    return null;
  }
}

function isCalendarCategory(value: string): value is CalendarCategory {
  return CALENDAR_CATEGORIES.some((category) => category === value);
}

function isLocationType(value: string): value is LocationType {
  return locationOptions.some((option) => option.value === value);
}

function nextHour(value: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return '11:00';
  const hour = Math.min(23, Number(match[1]) + 1);
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}
