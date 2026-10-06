import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { CalendarAvailabilityResponse } from '@repo/client/api-client/schemas';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { formatInstantTime } from '@core/features/calendar/lib/calendar-datetime';

import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react-native';

export function CalendarAvailabilityStatus({
  errorMessage,
  participantLabels,
  pending,
  result,
  timeZone,
}: {
  errorMessage?: string | null;
  participantLabels?: ReadonlyMap<string, string>;
  pending: boolean;
  result: CalendarAvailabilityResponse | null;
  timeZone: string;
}) {
  if (pending) {
    return (
      <View className="flex-row items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <Icon as={LoaderCircle} className="size-3.5 text-muted-foreground" />
        <Text className="text-[11px] text-muted-foreground">
          참여자와 회의실 일정을 확인하는 중입니다.
        </Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <AvailabilityShell tone="warning">
        <Text className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          일정 확인에 실패했습니다.
        </Text>
        <Text className="text-[10px] text-amber-700/80 dark:text-amber-300/80">
          {errorMessage}
        </Text>
      </AvailabilityShell>
    );
  }

  if (!result) return null;
  if (result.available) {
    return (
      <AvailabilityShell tone="success">
        <View className="flex-row items-center gap-1.5">
          <Icon as={CheckCircle2} className="size-3.5 text-emerald-500" />
          <Text className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            선택한 시간에 예약할 수 있습니다.
          </Text>
        </View>
      </AvailabilityShell>
    );
  }

  return (
    <AvailabilityShell tone="danger">
      <View className="flex-row items-center gap-1.5">
        <Icon as={AlertTriangle} className="size-3.5 text-rose-500" />
        <Text className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
          일정 충돌을 해결해야 예약할 수 있습니다.
        </Text>
      </View>
      {result.participantConflicts.map((conflict, index) => (
        <Text
          className="text-[10px] text-rose-700/80 dark:text-rose-300/80"
          key={`${conflict.userId}-${conflict.startAt}-${index}`}
        >
          {conflict.sourceType === 'organizer' ? '주최자' : '참여자'} ·{' '}
          {participantLabels?.get(conflict.userId) ?? '일정 있음'} ·{' '}
          {formatInstantTime(conflict.startAt, timeZone)}–
          {formatInstantTime(conflict.endAt, timeZone)}
        </Text>
      ))}
      {result.roomConflict ? (
        <Text className="text-[10px] text-rose-700/80 dark:text-rose-300/80">
          회의실 · {formatInstantTime(result.roomConflict.startAt, timeZone)}–
          {formatInstantTime(result.roomConflict.endAt, timeZone)}
        </Text>
      ) : null}
    </AvailabilityShell>
  );
}

function AvailabilityShell({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'success' | 'warning' | 'danger';
}) {
  return (
    <View
      className={cn(
        'gap-1 rounded-lg border px-3 py-2',
        tone === 'success' && 'border-emerald-500/20 bg-emerald-500/5',
        tone === 'warning' && 'border-amber-500/20 bg-amber-500/5',
        tone === 'danger' && 'border-rose-500/20 bg-rose-500/5',
      )}
    >
      {children}
    </View>
  );
}
