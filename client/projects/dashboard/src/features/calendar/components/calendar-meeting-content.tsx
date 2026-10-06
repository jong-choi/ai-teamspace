import { Pressable, View } from 'react-native';

import { getProblemDetails } from '@repo/client/api-client/runtime';
import {
  type MeetingDetail,
  UpdateMeeting as UpdateMeetingSchema,
} from '@repo/client/api-client/schemas';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import {
  useCalendarAgendaMutation,
  useCalendarMetadataMutation,
  useCalendarNotesMutation,
} from '@core/features/calendar/calendar-content-mutations';
import { CalendarMarkdownEditor } from '@core/features/calendar/components/calendar-markdown-editor';

import { CalendarClock, Pencil, Save } from 'lucide-react-native';

const reminderOptions = [
  { label: '알림 없음', value: 'none' },
  { label: '10분 전', value: '10' },
  { label: '30분 전', value: '30' },
  { label: '1시간 전', value: '60' },
] as const;

export function CalendarMeetingAgenda({
  draft,
  editing,
  meeting,
  onChange,
  onEditingChange,
  organizationId,
}: {
  draft: string;
  editing: boolean;
  meeting: MeetingDetail;
  onChange: (value: string) => void;
  onEditingChange: (editing: boolean) => void;
  organizationId: string;
}) {
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const mutation = useCalendarAgendaMutation(organizationId, meeting.id);

  const save = async () => {
    try {
      await mutation.updateAgenda({ agendaMarkdown: draft });
      onEditingChange(false);
      notifySuccess({ title: '회의 안건을 저장했습니다.' });
    } catch (error) {
      const problem = getProblemDetails(error);
      notifyError({
        title: '회의 안건을 저장하지 못했습니다.',
        description: problem?.detail ?? '잠시 후 다시 시도해 주세요.',
      });
    }
  };

  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Icon as={CalendarClock} className="size-3.5 text-muted-foreground" />
          <Text className="text-xs font-semibold">회의 안건</Text>
        </View>
        {!meeting.canceledAt ? (
          <Pressable
            className="flex-row items-center gap-1 px-1 py-0.5"
            disabled={mutation.isPending}
            onPress={() => (editing ? void save() : onEditingChange(true))}
          >
            <Icon
              as={editing ? Save : Pencil}
              className="size-3 text-emerald-500"
            />
            <Text className="text-[10px] font-medium text-emerald-500">
              {editing ? '저장하기' : '수정'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <CalendarMarkdownEditor
        accessibilityLabel={
          editing ? '회의 안건 Markdown 편집' : '회의 안건 Markdown 보기'
        }
        editable={editing}
        onChangeText={onChange}
        placeholder="등록된 안건이 없습니다."
        value={draft}
      />
    </View>
  );
}

export function CalendarMeetingNotes({
  draft,
  meeting,
  onChange,
  organizationId,
}: {
  draft: string;
  meeting: MeetingDetail;
  onChange: (value: string) => void;
  organizationId: string;
}) {
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const mutation = useCalendarNotesMutation(organizationId, meeting.id);

  const save = async () => {
    try {
      await mutation.updateNotes({ notesMarkdown: draft });
      notifySuccess({ title: '회의록 메모를 저장했습니다.' });
    } catch (error) {
      const problem = getProblemDetails(error);
      notifyError({
        title: '회의록을 저장하지 못했습니다.',
        description: problem?.detail ?? '잠시 후 다시 시도해 주세요.',
      });
    }
  };

  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold">
          회의록 작성 및 실시간 메모
        </Text>
        {!meeting.canceledAt ? (
          <Pressable
            className="flex-row items-center gap-1 px-1 py-0.5"
            disabled={mutation.isPending || draft === meeting.notesMarkdown}
            onPress={() => void save()}
          >
            <Icon as={Save} className="size-3 text-emerald-500" />
            <Text className="text-[10px] font-medium text-emerald-500">
              저장하기
            </Text>
          </Pressable>
        ) : null}
      </View>
      <CalendarMarkdownEditor
        accessibilityLabel="회의록 Markdown 편집"
        editable={!meeting.canceledAt}
        onChangeText={onChange}
        placeholder="회의 진행 중 결정된 사항이나 TODO를 기록하세요..."
        value={draft}
      />
    </View>
  );
}

export function CalendarMeetingReminder({
  meeting,
  organizationId,
}: {
  meeting: MeetingDetail;
  organizationId: string;
}) {
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const mutation = useCalendarMetadataMutation(organizationId, meeting.id);

  const updateReminder = async (value: string) => {
    const reminderMinutes = value === 'none' ? null : Number(value);
    try {
      const input = UpdateMeetingSchema.parse({ reminderMinutes });
      await mutation.updateMeeting(input);
      notifySuccess({ title: '회의 알림 설정을 저장했습니다.' });
    } catch (error) {
      const problem = getProblemDetails(error);
      notifyError({
        title: '알림 설정을 저장하지 못했습니다.',
        description: problem?.detail ?? '설정 값을 확인해 주세요.',
      });
    }
  };

  return (
    <View className="flex-row items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
      <View className="min-w-0 flex-1">
        <Text className="text-xs font-semibold">회의 알림</Text>
        <Text className="text-[10px] text-muted-foreground">
          설정 저장 상태이며 실제 알림 전송 완료를 의미하지 않습니다.
        </Text>
      </View>
      <View className="w-32">
        <Select
          disabled={meeting.canceledAt !== null || mutation.isPending}
          onValueChange={(option) =>
            option?.value && void updateReminder(option.value)
          }
          value={
            meeting.reminderMinutes === null
              ? { label: '알림 없음', value: 'none' }
              : {
                  label:
                    reminderOptions.find(
                      (option) =>
                        option.value === String(meeting.reminderMinutes),
                    )?.label ?? `${meeting.reminderMinutes}분 전`,
                  value: String(meeting.reminderMinutes),
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
  );
}
