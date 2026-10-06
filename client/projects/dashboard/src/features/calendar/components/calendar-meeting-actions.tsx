import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { getProblemDetails } from '@repo/client/api-client/runtime';
import {
  type CancelMeeting,
  CancelMeeting as CancelMeetingSchema,
  type MeetingDetail,
} from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
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
import { useCalendarIcsExport } from '@core/features/calendar/calendar-ics';
import { useCancelCalendarMeeting } from '@core/features/calendar/calendar-scheduling-mutations';

import { Download, Pencil, Trash2, X } from 'lucide-react-native';

const cancelScopes = CancelMeetingSchema.shape.scope.unwrap().options;
type CancelScope = NonNullable<CancelMeeting['scope']>;

export function CalendarMeetingActions({
  meeting,
  onClose,
  onOpenReschedule,
  organizationId,
}: {
  meeting: MeetingDetail;
  onClose: () => void;
  onOpenReschedule: () => void;
  organizationId: string;
}) {
  const { exportCalendarIcs, notifyError, notifySuccess } =
    useDashboardPlatform();
  const exportIcs = useCalendarIcsExport(organizationId, meeting.id);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelScope, setCancelScope] = useState<CancelScope>('single');
  const [exporting, setExporting] = useState(false);
  const cancelMutation = useCancelCalendarMeeting(
    organizationId,
    meeting.id,
    () => {
      notifySuccess({ title: '회의를 취소했습니다.' });
      setCancelConfirm(false);
    },
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const contentIcs = await exportIcs();
      await exportCalendarIcs({
        fileName: `${sanitizeFileName(meeting.title)}.ics`,
        contentIcs,
      });
      notifySuccess({ title: 'iCal 파일을 내보냈습니다.' });
    } catch (error) {
      const problem = getProblemDetails(error);
      notifyError({
        title: 'iCal 파일을 내보내지 못했습니다.',
        description: problem?.detail ?? '잠시 후 다시 시도해 주세요.',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleCancel = async () => {
    try {
      const input = CancelMeetingSchema.parse({
        reason: cancelReason.trim() || null,
        scope: meeting.recurrence ? cancelScope : 'single',
      });
      await cancelMutation.cancelMeeting(input);
    } catch (error) {
      const problem = getProblemDetails(error);
      notifyError({
        title: '회의를 취소하지 못했습니다.',
        description: problem?.detail ?? '입력값을 확인해 주세요.',
      });
    }
  };

  return (
    <View className="gap-3 border-t border-border pt-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[10px] text-muted-foreground">
            연계 프로젝트
          </Text>
          <Text className="text-[10px] font-medium">
            {meeting.project?.name ?? '연계 프로젝트 없음'}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable
            accessibilityLabel="iCal 파일 내보내기"
            className="flex-row items-center gap-1 rounded-md px-2 py-1.5 web:hover:bg-accent"
            disabled={exporting}
            onPress={() => void handleExport()}
          >
            <Icon as={Download} className="size-3.5 text-muted-foreground" />
            <Text className="text-[10px] text-muted-foreground">
              {exporting ? '내보내는 중...' : '.ics 내보내기'}
            </Text>
          </Pressable>
          {!meeting.canceledAt ? (
            <>
              <Pressable
                accessibilityLabel="회의 일정 변경"
                className="flex-row items-center gap-1 rounded-md px-2 py-1.5 web:hover:bg-accent"
                onPress={onOpenReschedule}
              >
                <Icon as={Pencil} className="size-3.5 text-muted-foreground" />
                <Text className="text-[10px] text-muted-foreground">
                  일정 변경
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel="회의 취소"
                className="rounded-md p-1.5 web:hover:bg-rose-500/10"
                onPress={() => setCancelConfirm(true)}
              >
                <Icon as={Trash2} className="size-3.5 text-rose-500" />
              </Pressable>
            </>
          ) : null}
        </View>
      </View>

      {cancelConfirm && !meeting.canceledAt ? (
        <View className="gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
              이 회의를 취소하시겠습니까?
            </Text>
            <Pressable onPress={() => setCancelConfirm(false)}>
              <Icon as={X} className="size-3.5 text-muted-foreground" />
            </Pressable>
          </View>
          <Input
            className="h-8 text-xs"
            maxLength={1000}
            onChangeText={setCancelReason}
            placeholder="취소 사유 (선택)"
            value={cancelReason}
          />
          {meeting.recurrence ? (
            <Select
              onValueChange={(option) => {
                const value = option?.value;
                if (value && isCancelScope(value)) setCancelScope(value);
              }}
              value={{
                label: cancelScopeLabel(cancelScope),
                value: cancelScope,
              }}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder="취소 범위" />
              </SelectTrigger>
              <SelectContent side="bottom">
                {cancelScopes.map((scope) => (
                  <SelectItem
                    key={scope}
                    label={cancelScopeLabel(scope)}
                    value={scope}
                  >
                    {cancelScopeLabel(scope)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <View className="flex-row justify-end gap-2">
            <Button
              onPress={() => setCancelConfirm(false)}
              size="sm"
              variant="ghost"
            >
              <Text>돌아가기</Text>
            </Button>
            <Button
              disabled={cancelMutation.isPending}
              onPress={() => void handleCancel()}
              size="sm"
              variant="destructive"
            >
              <Text className="text-destructive-foreground">
                {cancelMutation.isPending ? '취소 중...' : '회의 취소'}
              </Text>
            </Button>
          </View>
        </View>
      ) : null}

      <Pressable className="items-center py-1" onPress={onClose}>
        <Text className="text-[10px] text-muted-foreground">닫기</Text>
      </Pressable>
    </View>
  );
}

function isCancelScope(value: string): value is CancelScope {
  return cancelScopes.some((scope) => scope === value);
}

function cancelScopeLabel(scope: CancelScope): string {
  if (scope === 'series') return '반복 일정 전체';
  if (scope === 'future') return '이후 일정';
  return '이번 일정';
}

function sanitizeFileName(value: string): string {
  const sanitized = value.trim().replace(/[\\/:*?"<>|\s]+/g, '_');
  return sanitized || 'meeting';
}
