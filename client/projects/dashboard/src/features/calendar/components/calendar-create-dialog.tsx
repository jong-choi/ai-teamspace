import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { getProblemDetails } from '@repo/client/api-client/runtime';
import type {
  CreateMeeting,
  MeetingDetail,
  MeetingRoom,
  OrganizationMember,
} from '@repo/client/api-client/schemas';
import { CreateMeeting as CreateMeetingSchema } from '@repo/client/api-client/schemas';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
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
import { cn } from '@repo/client/rnr/lib/utils';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import {
  useCalendarMembers,
  useCreateCalendarMeeting,
} from '@core/features/calendar/calendar-query';
import { CalendarMarkdownEditor } from '@core/features/calendar/components/calendar-markdown-editor';
import {
  CALENDAR_CATEGORIES,
  CALENDAR_CATEGORY_META,
  type CalendarCategory,
} from '@core/features/calendar/lib/calendar-category';
import { zonedDateTimeToIso } from '@core/features/calendar/lib/calendar-datetime';

import {
  Bell,
  CalendarPlus,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react-native';

export type CalendarCreateRequest = {
  dateKey: string;
  startTime?: string;
};

type LocationType = CreateMeeting['locationType'];

const locationOptions: readonly { label: string; value: LocationType }[] = [
  { label: '온라인', value: 'online' },
  { label: '회의실', value: 'meeting_room' },
  { label: '기타 장소', value: 'other' },
];

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
  const [endTime, setEndTime] = useState('11:00');
  const [meetingTimeZone, setMeetingTimeZone] = useState(timeZone);
  const [locationType, setLocationType] = useState<LocationType>('online');
  const [meetingRoomId, setMeetingRoomId] = useState<string | null>(null);
  const [locationText, setLocationText] = useState('');
  const [agendaMarkdown, setAgendaMarkdown] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState<OrganizationMember[]>(
    [],
  );
  const [formError, setFormError] = useState<string | null>(null);
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
    setDateKey(request.dateKey);
    setStartTime(request.startTime ?? '10:00');
    setEndTime(nextHour(request.startTime ?? '10:00'));
    setMeetingTimeZone(timeZone);
    setFormError(null);
  }, [open, request.dateKey, request.startTime, timeZone]);

  const activeRooms = rooms.filter((room) => room.active);

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

    let startAt: string;
    let endAt: string;
    try {
      startAt = zonedDateTimeToIso(dateKey, startTime, meetingTimeZone);
      endAt = zonedDateTimeToIso(dateKey, endTime, meetingTimeZone);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : '날짜, 시간, timezone을 확인해 주세요.',
      );
      return;
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setFormError('종료 시간은 시작 시간보다 늦어야 합니다.');
      return;
    }

    let input: CreateMeeting;
    try {
      input = CreateMeetingSchema.parse({
        title: normalizedTitle,
        category,
        startAt,
        endAt,
        timeZone: meetingTimeZone,
        locationType,
        meetingRoomId: locationType === 'meeting_room' ? meetingRoomId : null,
        locationText: locationType === 'other' ? locationText.trim() : null,
        projectId: null,
        attendeeUserIds: selectedMembers.map((member) => member.userId),
        agendaMarkdown,
        reminderMinutes: reminderEnabled ? 10 : null,
      });
    } catch {
      setFormError(
        '입력값을 확인해 주세요. 회의 생성 조건에 맞지 않는 값이 있습니다.',
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

            <Field label="회의 안건 (Markdown)">
              <CalendarMarkdownEditor
                onChangeText={setAgendaMarkdown}
                placeholder={'- 주요 안건 1\n- 주요 안건 2'}
                value={agendaMarkdown}
              />
            </Field>

            <Pressable
              accessibilityLabel="10분 전 알림"
              accessibilityRole="switch"
              accessibilityState={{ checked: reminderEnabled }}
              className="flex-row items-center justify-between rounded-lg border border-border px-3 py-2.5"
              onPress={() => setReminderEnabled((value) => !value)}
            >
              <View className="flex-row items-center gap-2">
                <Icon as={Bell} className="size-3.5 text-muted-foreground" />
                <Text className="text-xs">10분 전 알림</Text>
              </View>
              <View
                className={cn(
                  'h-5 w-9 rounded-full bg-muted p-0.5',
                  reminderEnabled && 'bg-emerald-500',
                )}
              >
                <View
                  className={cn(
                    'size-4 rounded-full bg-white',
                    reminderEnabled && 'translate-x-4',
                  )}
                />
              </View>
            </Pressable>

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
          <Button disabled={mutation.isPending} onPress={() => void submit()}>
            <Text className="text-primary-foreground">
              {mutation.isPending ? '예약 중...' : '예약 완료'}
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

function CalendarAttendeePicker({
  currentUserId,
  onChange,
  organizationId,
  selectedMembers,
}: {
  currentUserId: string;
  onChange: (members: OrganizationMember[]) => void;
  organizationId: string;
  selectedMembers: OrganizationMember[];
}) {
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim();

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Icon as={Users} className="size-3.5 text-muted-foreground" />
          <Text className="text-[11px] font-semibold text-muted-foreground">
            참여자 지정
          </Text>
        </View>
        <Text className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          {selectedMembers.length}명 선택
        </Text>
      </View>

      <View className="min-h-9 flex-row flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/20 p-2">
        {selectedMembers.length === 0 ? (
          <Text className="py-0.5 text-xs text-muted-foreground">
            참여자를 검색하여 추가해 주세요.
          </Text>
        ) : (
          selectedMembers.map((member) => (
            <Pressable
              accessibilityLabel={`${member.user.name} 참여자에서 제거`}
              className="flex-row items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 shadow-sm shadow-black/5"
              key={member.userId}
              onPress={() =>
                onChange(
                  selectedMembers.filter(
                    (selected) => selected.userId !== member.userId,
                  ),
                )
              }
            >
              <MemberAvatar
                compact
                image={member.user.image}
                name={member.user.name}
              />
              <Text className="text-[10px] font-medium">
                {member.user.name}
              </Text>
              <Text className="text-[9px] text-muted-foreground">
                ({memberRoleLabel(member.role)})
              </Text>
              <Icon as={X} className="size-3 text-muted-foreground" />
            </Pressable>
          ))
        )}
      </View>

      <View className="relative">
        <Icon
          as={Search}
          className="pointer-events-none absolute left-2.5 top-2.5 z-10 size-3.5 text-muted-foreground"
        />
        <Input
          accessibilityLabel="참여자 검색"
          className="h-9 pl-8 text-xs"
          maxLength={100}
          onChangeText={setSearch}
          placeholder="이름 또는 이메일로 조직 멤버 검색..."
          value={search}
        />
      </View>

      {normalizedSearch.length > 0 ? (
        <DashboardQueryBoundary
          errorFallbackClassName="min-h-24 rounded-lg border border-border"
          fallback={
            <DashboardLoading
              className="min-h-24 rounded-lg border border-border"
              label="멤버를 검색하는 중..."
            />
          }
          resetKeys={[organizationId, normalizedSearch]}
          title="멤버 검색을 불러오지 못했습니다"
        >
          <CalendarAttendeeSearchResults
            currentUserId={currentUserId}
            onSelect={(member) => {
              onChange([...selectedMembers, member]);
              setSearch('');
            }}
            organizationId={organizationId}
            search={normalizedSearch}
            selectedMembers={selectedMembers}
          />
        </DashboardQueryBoundary>
      ) : null}
    </View>
  );
}

function CalendarAttendeeSearchResults({
  currentUserId,
  onSelect,
  organizationId,
  search,
  selectedMembers,
}: {
  currentUserId: string;
  onSelect: (member: OrganizationMember) => void;
  organizationId: string;
  search: string;
  selectedMembers: readonly OrganizationMember[];
}) {
  const members = useCalendarMembers(organizationId, search).data.items;
  const selectableMembers = members.filter(
    (member) =>
      member.userId !== currentUserId &&
      !selectedMembers.some((selected) => selected.userId === member.userId),
  );

  return (
    <View className="max-h-44 gap-1 rounded-lg border border-border bg-card p-1.5 shadow-lg shadow-black/5">
      {selectableMembers.slice(0, 8).map((member) => (
        <Pressable
          accessibilityLabel={`${member.user.name} 참여자로 추가`}
          className="flex-row items-center gap-2 rounded-md px-2 py-1.5 web:hover:bg-accent"
          key={member.userId}
          onPress={() => onSelect(member)}
        >
          <MemberAvatar image={member.user.image} name={member.user.name} />
          <View className="min-w-0 flex-1">
            <Text className="truncate text-xs font-medium">
              {member.user.name}
            </Text>
            <Text className="truncate text-[10px] text-muted-foreground">
              {member.user.email}
            </Text>
          </View>
          <Icon as={UserPlus} className="size-3.5 text-muted-foreground" />
        </Pressable>
      ))}
      {selectableMembers.length === 0 ? (
        <Text className="px-2 py-2 text-xs text-muted-foreground">
          검색 결과가 없습니다.
        </Text>
      ) : null}
    </View>
  );
}

function isCalendarCategory(value: string): value is CalendarCategory {
  return CALENDAR_CATEGORIES.some((category) => category === value);
}

function isLocationType(value: string): value is LocationType {
  return locationOptions.some((option) => option.value === value);
}

function memberRoleLabel(role: OrganizationMember['role']): string {
  if (role === 'owner') return '소유자';
  if (role === 'admin') return '관리자';
  return '멤버';
}

function MemberAvatar({
  compact = false,
  image,
  name,
}: {
  compact?: boolean;
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
    <Avatar alt={name} className={compact ? 'size-4' : 'size-7'}>
      {image ? <AvatarImage source={{ uri: image }} /> : null}
      <AvatarFallback>
        <Text
          className={
            compact ? 'text-[7px] font-bold' : 'text-[9px] font-semibold'
          }
        >
          {initials || '?'}
        </Text>
      </AvatarFallback>
    </Avatar>
  );
}

function nextHour(value: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return '11:00';
  const hour = Math.min(23, Number(match[1]) + 1);
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}
