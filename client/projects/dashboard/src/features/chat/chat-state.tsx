import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { getProblemDetail } from '@core/features/chat/chat-presenter';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';

import { QueryErrorResetBoundary } from '@tanstack/react-query';

export function ChatLoading({ label }: { label: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3 px-6">
      <ActivityIndicator />
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

export function ChatState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-sm font-semibold">{title}</Text>
      <Text className="mt-1 max-w-md text-center text-xs leading-5 text-muted-foreground">
        {description}
      </Text>
    </View>
  );
}

type ChatErrorBoundaryProps = {
  children: ReactNode;
};

export function ChatErrorBoundary({ children }: ChatErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ChatErrorBoundaryImpl onReset={reset}>
          {children}
        </ChatErrorBoundaryImpl>
      )}
    </QueryErrorResetBoundary>
  );
}

type ChatErrorBoundaryImplProps = ChatErrorBoundaryProps & {
  onReset: () => void;
};

type ChatErrorBoundaryState = {
  error: unknown;
};

class ChatErrorBoundaryImpl extends Component<
  ChatErrorBoundaryImplProps,
  ChatErrorBoundaryState
> {
  state: ChatErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ChatErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (__DEV__) {
      console.warn('채팅 화면 렌더링 오류가 발생했습니다.', error, info);
    }
  }

  private retry = () => {
    this.props.onReset();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-sm font-semibold">
          채팅을 불러오지 못했습니다
        </Text>
        <Text className="mt-1 max-w-md text-center text-xs leading-5 text-muted-foreground">
          {getProblemDetail(this.state.error) ??
            '연결 상태를 확인한 뒤 다시 시도해 주세요.'}
        </Text>
        <Button className="mt-4" onPress={this.retry} variant="outline">
          <Text>다시 시도</Text>
        </Button>
      </View>
    );
  }
}
