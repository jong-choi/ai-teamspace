import { ScrollView, View } from 'react-native';

import type { MeetingRoom } from '@repo/client/api-client/schemas';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';

import { Building2, Layers3, Users } from 'lucide-react-native';

export function CalendarRoomsDialog({
  onOpenChange,
  open,
  rooms,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  rooms: readonly MeetingRoom[];
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[88vh] max-w-4xl">
        <DialogHeader>
          <View className="flex-row items-center gap-2.5">
            <View className="size-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Icon as={Building2} className="size-4 text-emerald-500" />
            </View>
            <View className="min-w-0 flex-1">
              <DialogTitle>회의실 현황</DialogTitle>
              <DialogDescription className="text-xs">
                조직에 등록된 회의실의 수용 인원, 위치와 운영 상태를 확인합니다.
              </DialogDescription>
            </View>
          </View>
        </DialogHeader>

        <ScrollView
          className="max-h-[560px]"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-3 py-1 sm:flex-row sm:flex-wrap">
            {rooms.map((room) => (
              <View
                className="rounded-xl border border-border bg-card p-3.5 shadow-sm shadow-black/5 sm:w-[48%] lg:w-[23%]"
                key={room.id}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1 gap-1">
                    <View className="flex-row items-center gap-2">
                      <Text
                        className="min-w-0 flex-1 text-xs font-bold"
                        numberOfLines={1}
                      >
                        {room.name}
                      </Text>
                      <View className="flex-row items-center gap-1 rounded-full border border-border px-2 py-0.5">
                        <View
                          className={`size-1.5 rounded-full ${room.active ? 'bg-emerald-500' : 'bg-zinc-400'}`}
                        />
                        <Text className="text-[9px] font-medium text-muted-foreground">
                          {room.active ? '활성' : '비활성'}
                        </Text>
                      </View>
                    </View>
                    <View className="flex-row flex-wrap items-center gap-3">
                      <View className="flex-row items-center gap-1">
                        <Icon
                          as={Users}
                          className="size-3.5 text-muted-foreground"
                        />
                        <Text className="text-[11px] text-muted-foreground">
                          {room.capacity}인
                        </Text>
                      </View>
                      {room.floor ? (
                        <View className="flex-row items-center gap-1">
                          <Icon
                            as={Layers3}
                            className="size-3.5 text-muted-foreground"
                          />
                          <Text className="text-[11px] text-muted-foreground">
                            {room.floor}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {room.description ? (
                      <Text className="mt-1 text-[11px] leading-4 text-muted-foreground">
                        {room.description}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
            {rooms.length === 0 ? (
              <View className="items-center rounded-xl border border-dashed border-border py-12">
                <Icon as={Building2} className="size-6 text-muted-foreground" />
                <Text className="mt-2 text-xs text-muted-foreground">
                  등록된 회의실이 없습니다.
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </DialogContent>
    </Dialog>
  );
}
