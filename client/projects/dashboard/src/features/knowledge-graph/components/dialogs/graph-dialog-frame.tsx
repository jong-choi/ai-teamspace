import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

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
import { Label } from '@repo/client/rnr/components/ui/label';
import { Skeleton } from '@repo/client/rnr/components/ui/skeleton';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { DIALOG_WIDTH } from '@core/app/ui/dialog-width';

import type { LucideIcon } from 'lucide-react-native';

/**
 * graph.html node/edge 모달의 공통 틀: max-w-md, 작은 아이콘 상자+굵은 제목,
 * 구분선, 우측 하단 취소/저장. 편집·정정·삭제 확인 모달이 모두 이 틀을 쓴다.
 */
export function GraphDialogFrame({
  busy = false,
  children,
  description,
  icon,
  onOpenChange,
  title,
}: {
  busy?: boolean;
  children: ReactNode;
  description?: string;
  icon: LucideIcon;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && busy) return;
        onOpenChange(open);
      }}
      open
    >
      {/* Web의 Radix 래퍼가 폭을 갖지 않아 max-w-md 폭을 직접 준다. */}
      <DialogContent className={cn('gap-5 rounded-2xl p-6', DIALOG_WIDTH.md)}>
        <DialogHeader className="flex-row items-center gap-2 border-b border-border/60 pb-3 pr-6">
          <View className="rounded-lg bg-muted p-1.5">
            <Icon as={icon} className="size-4" />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <DialogTitle className="text-sm font-bold">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="text-[11px] leading-4">
                {description}
              </DialogDescription>
            ) : null}
          </View>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function GraphDialogFooter({
  busy,
  confirmDisabled = false,
  confirmLabel,
  destructive = false,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  confirmDisabled?: boolean;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogFooter className="border-t border-border/60 pt-3">
      <Button
        className="rounded-lg"
        disabled={busy}
        onPress={onCancel}
        size="sm"
        variant="secondary"
      >
        <Text className="text-xs">취소</Text>
      </Button>
      <Button
        className="rounded-lg"
        disabled={busy || confirmDisabled}
        onPress={onConfirm}
        size="sm"
        variant={destructive ? 'destructive' : 'default'}
      >
        {busy ? <ActivityIndicator size="small" /> : null}
        <Text className="text-xs">{confirmLabel}</Text>
      </Button>
    </DialogFooter>
  );
}

export function GraphFormField({
  children,
  error,
  hint,
  label,
}: {
  children: ReactNode;
  error?: string | null;
  hint?: string;
  label: string;
}) {
  return (
    <View className="gap-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {error ? (
        <Text className="text-[11px] text-destructive">{error}</Text>
      ) : hint ? (
        <Text className="text-[11px] text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
}

export function GraphDialogSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <View
      accessibilityLabel="편집할 내용을 불러오는 중"
      accessibilityRole="progressbar"
      className="gap-4"
    >
      {Array.from({ length: fields }, (_, index) => (
        <View className="gap-1.5" key={index}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </View>
      ))}
    </View>
  );
}
