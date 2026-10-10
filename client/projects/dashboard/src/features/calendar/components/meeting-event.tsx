import { Pressable, View } from 'react-native';

import type { MeetingSummary } from '@repo/client/api-client/schemas';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { CALENDAR_CATEGORY_META } from '@core/features/calendar/lib/calendar-category';
import {
  getMeetingAttendeeCount,
  getMeetingLocationLabel,
  getMeetingTimeLabel,
} from '@core/features/calendar/lib/calendar-meeting';

import { Clock, MapPin, Monitor, Users } from 'lucide-react-native';

type MeetingEventProps = {
  compact?: boolean;
  meeting: MeetingSummary;
  onPress: (meetingId: string) => void;
  timeZone: string;
};

export function MeetingEvent({
  compact = false,
  meeting,
  onPress,
  timeZone,
}: MeetingEventProps) {
  const meta = CALENDAR_CATEGORY_META[meeting.category];
  const canceled = meeting.canceledAt !== null;
  const timeLabel = getMeetingTimeLabel(meeting, timeZone);

  return (
    <Pressable
      accessibilityLabel={`${timeLabel} ${meeting.title}`}
      className={cn(
        'rounded-md border px-2 web:hover:opacity-90',
        compact ? 'py-0.5' : 'py-1',
        meta.chipClassName,
        canceled && 'opacity-50',
      )}
      onPress={() => onPress(meeting.id)}
    >
      <View className="min-w-0 flex-row items-center gap-1">
        <Text
          className={cn(
            'shrink-0 font-mono text-2xs opacity-70',
            meta.chipTextClassName,
          )}
        >
          {timeLabel.split(' – ')[0]}
        </Text>
        <Text
          className={cn(
            'min-w-0 flex-1 truncate text-xs font-semibold',
            meta.chipTextClassName,
            canceled && 'line-through',
          )}
          numberOfLines={1}
        >
          {meeting.title}
        </Text>
      </View>

      {!compact ? (
        <View className="mt-1 gap-0.5">
          <View className="flex-row items-center gap-1">
            <Icon
              as={meeting.locationType === 'online' ? Monitor : MapPin}
              className="size-3 opacity-60"
            />
            <Text className="min-w-0 flex-1 truncate text-2xs opacity-70">
              {getMeetingLocationLabel(meeting)}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <View className="flex-row items-center gap-1">
              <Icon as={Users} className="size-3 opacity-60" />
              <Text className="text-2xs opacity-70">
                {getMeetingAttendeeCount(meeting)}명
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Icon as={Clock} className="size-3 opacity-60" />
              <Text className="text-2xs opacity-70">{timeLabel}</Text>
            </View>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}
