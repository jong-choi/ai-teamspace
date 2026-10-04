import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';

import { Portal } from '@rn-primitives/portal';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DEFAULT_DURATION_MS = 4_500;
const MAX_VISIBLE_TOASTS = 3;

export type ToastInput = {
  id?: string;
  title: string;
  description?: string;
  duration?: number;
  variant?: 'default' | 'destructive';
};

type ToastRecord = ToastInput & {
  id: string;
};

type ToastContextValue = {
  dismiss: (id: string) => void;
  show: (input: ToastInput) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);
let toastSequence = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const toastsRef = useRef<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const insets = useSafeAreaInsets();

  const commitToasts = useCallback((next: ToastRecord[]) => {
    toastsRef.current = next;
    setToasts(next);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      const timer = timers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
      commitToasts(toastsRef.current.filter((toast) => toast.id !== id));
    },
    [commitToasts],
  );

  const show = useCallback(
    (input: ToastInput) => {
      const id = input.id ?? `toast-${++toastSequence}`;
      const duration = input.duration ?? DEFAULT_DURATION_MS;
      const previousTimer = timers.current.get(id);
      if (previousTimer) {
        clearTimeout(previousTimer);
        timers.current.delete(id);
      }

      const next = [
        ...toastsRef.current.filter((toast) => toast.id !== id),
        { ...input, id },
      ];
      const hidden = next.slice(0, -MAX_VISIBLE_TOASTS);
      const visible = next.slice(-MAX_VISIBLE_TOASTS);
      for (const toast of hidden) {
        const timer = timers.current.get(toast.id);
        if (timer) {
          clearTimeout(timer);
          timers.current.delete(toast.id);
        }
      }
      commitToasts(visible);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => {
            timers.current.delete(id);
            commitToasts(toastsRef.current.filter((toast) => toast.id !== id));
          }, duration),
        );
      }

      return id;
    },
    [commitToasts],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        clearTimeout(timer);
      }
      timers.current.clear();
    },
    [],
  );

  const value = useMemo(() => ({ dismiss, show }), [dismiss, show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Portal name="rnr-toast-viewport">
        <View
          className="absolute inset-x-0 z-50 items-center gap-2 px-4"
          pointerEvents="box-none"
          style={{ top: insets.top + 12 }}
        >
          {toasts.map((toast) => (
            <View
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              className={cn(
                'w-full max-w-md flex-row items-start gap-3 rounded-xl border bg-background p-4 shadow-lg',
                toast.variant === 'destructive' &&
                  'border-destructive/40 bg-destructive/10',
              )}
              key={toast.id}
            >
              <View className="min-w-0 flex-1 gap-1">
                <Text
                  className={cn(
                    'text-sm font-semibold',
                    toast.variant === 'destructive' && 'text-destructive',
                  )}
                >
                  {toast.title}
                </Text>
                {toast.description ? (
                  <Text className="text-xs leading-5 text-muted-foreground">
                    {toast.description}
                  </Text>
                ) : null}
              </View>
              <Button
                accessibilityLabel="알림 닫기"
                className="h-7 w-7"
                onPress={() => dismiss(toast.id)}
                size="icon"
                variant="ghost"
              >
                <Icon as={X} className="size-4 text-muted-foreground" />
              </Button>
            </View>
          ))}
        </View>
      </Portal>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error('ToastProvider가 연결되지 않았습니다.');
  }
  return value;
}
