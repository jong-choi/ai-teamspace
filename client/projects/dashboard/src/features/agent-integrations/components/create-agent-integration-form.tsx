import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, View } from 'react-native';

import type { AgentMcpConnection } from '@repo/client/api-client/schemas';
import { CreateAgentMcpConnection } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Label } from '@repo/client/rnr/components/ui/label';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  agentIntegrationErrorMessage,
  useAgentIntegrationMutations,
} from '@core/features/agent-integrations/agent-integrations-mutations';

import { Eye, EyeOff } from 'lucide-react-native';

type CreateAgentIntegrationFormProps = {
  onCreated: (connection: AgentMcpConnection) => void;
  openAuthorization: (url: string) => Promise<void>;
};

const AUTH_KIND_OPTIONS = [
  { label: '인증 없음', value: 'none' },
  { label: 'Bearer token', value: 'bearer' },
  { label: 'OAuth', value: 'oauth' },
] as const;

export function CreateAgentIntegrationForm({
  onCreated,
  openAuthorization,
}: CreateAgentIntegrationFormProps) {
  const mutations = useAgentIntegrationMutations();
  const [secretVisible, setSecretVisible] = useState(false);
  const form = useForm<CreateAgentMcpConnection>({
    defaultValues: {
      authKind: 'none',
      bearerToken: undefined,
      displayName: '',
      endpoint: '',
    },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });
  const authKind = form.watch('authKind');
  const pending =
    form.formState.isSubmitting ||
    mutations.create.isPending ||
    mutations.startOauth.isPending ||
    mutations.testConnection.isPending;

  useEffect(
    () => () => {
      form.setValue('bearerToken', undefined);
    },
    [form],
  );

  const changeAuthKind = (next: CreateAgentMcpConnection['authKind']) => {
    form.setValue('authKind', next, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    if (next !== 'bearer') {
      form.setValue('bearerToken', undefined, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setSecretVisible(false);
    }
  };

  const submit = form.handleSubmit(async (values) => {
    form.clearErrors();
    if (values.authKind === 'bearer' && !values.bearerToken) {
      form.setError('bearerToken', {
        message: 'Bearer token을 입력해 주세요.',
      });
      return;
    }

    const parsed = CreateAgentMcpConnection.safeParse({
      authKind: values.authKind,
      displayName: values.displayName.trim(),
      endpoint: values.endpoint.trim(),
      ...(values.authKind === 'bearer'
        ? { bearerToken: values.bearerToken }
        : {}),
    });
    if (!parsed.success) {
      form.setError('root', {
        message: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.',
      });
      return;
    }

    try {
      const created = await mutations.create.mutateAsync({ data: parsed.data });
      form.reset({
        authKind: 'none',
        bearerToken: undefined,
        displayName: '',
        endpoint: '',
      });
      setSecretVisible(false);

      if (created.authKind === 'oauth') {
        const authorization = await mutations.startOauth.mutateAsync({
          connectionId: created.id,
        });
        await openAuthorization(authorization.authorizationUrl);
        await mutations.refreshConnection(created.id);
      } else {
        await mutations.testConnection.mutateAsync({
          connectionId: created.id,
        });
      }

      onCreated(created);
    } catch (error) {
      form.setError('root', {
        message: agentIntegrationErrorMessage(
          error,
          '외부 MCP 연결을 확인하지 못했습니다. 주소와 인증 정보를 확인해 주세요.',
        ),
      });
      form.setValue('bearerToken', undefined);
      setSecretVisible(false);
    }
  });

  return (
    <View className="gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <View className="gap-1">
        <Text className="text-base font-semibold">외부 MCP 추가</Text>
        <Text className="text-xs leading-5 text-muted-foreground">
          HTTPS Streamable HTTP endpoint를 등록합니다. 연결은 검증과 도구 선택을
          마치기 전까지 Agent에서 사용되지 않습니다.
        </Text>
      </View>

      <Controller
        control={form.control}
        name="displayName"
        render={({ field, fieldState }) => (
          <View className="gap-1.5">
            <Label nativeID="agent-integration-display-name">표시 이름</Label>
            <Input
              accessibilityLabel="외부 MCP 표시 이름"
              aria-invalid={fieldState.invalid}
              editable={!pending}
              maxLength={100}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              placeholder="GitHub MCP"
              value={field.value}
            />
            <FieldError message={fieldState.error?.message} />
          </View>
        )}
        rules={{ required: '표시 이름을 입력해 주세요.' }}
      />

      <Controller
        control={form.control}
        name="endpoint"
        render={({ field, fieldState }) => (
          <View className="gap-1.5">
            <Label nativeID="agent-integration-endpoint">MCP endpoint</Label>
            <Input
              accessibilityLabel="외부 MCP endpoint"
              aria-invalid={fieldState.invalid}
              autoCapitalize="none"
              autoComplete="off"
              editable={!pending}
              keyboardType="url"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              placeholder="https://mcp.example.com/mcp"
              value={field.value}
            />
            <Text className="text-[11px] leading-4 text-muted-foreground">
              HTTPS URL만 허용되며 redirect와 private network 접근은 서버
              정책으로 제한됩니다.
            </Text>
            <FieldError message={fieldState.error?.message} />
          </View>
        )}
        rules={{ required: 'MCP endpoint를 입력해 주세요.' }}
      />

      <View className="gap-1.5">
        <Label nativeID="agent-integration-auth-kind">인증 방식</Label>
        <View className="flex-row flex-wrap gap-2">
          {AUTH_KIND_OPTIONS.map((option) => (
            <Button
              disabled={pending}
              key={option.value}
              onPress={() => changeAuthKind(option.value)}
              size="sm"
              variant={authKind === option.value ? 'secondary' : 'outline'}
            >
              <Text>{option.label}</Text>
            </Button>
          ))}
        </View>
      </View>

      {authKind === 'bearer' ? (
        <Controller
          control={form.control}
          name="bearerToken"
          render={({ field, fieldState }) => (
            <View className="gap-1.5">
              <Label nativeID="agent-integration-bearer-token">
                Bearer token
              </Label>
              <View className="relative">
                <Input
                  accessibilityLabel="외부 MCP Bearer token"
                  aria-invalid={fieldState.invalid}
                  autoCapitalize="none"
                  autoComplete="off"
                  className="pr-11"
                  editable={!pending}
                  maxLength={16_384}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="Token은 저장 성공 후 이 입력에서 지워집니다"
                  secureTextEntry={!secretVisible}
                  value={field.value ?? ''}
                />
                <Button
                  accessibilityLabel={
                    secretVisible ? 'Bearer token 숨기기' : 'Bearer token 보기'
                  }
                  className="absolute right-0 top-0 h-10 w-10 rounded-l-none sm:h-9 sm:w-9"
                  disabled={pending}
                  onPress={() => setSecretVisible((visible) => !visible)}
                  size="icon"
                  variant="ghost"
                >
                  <Icon
                    as={secretVisible ? EyeOff : Eye}
                    className="size-4 text-muted-foreground"
                  />
                </Button>
              </View>
              <FieldError message={fieldState.error?.message} />
            </View>
          )}
        />
      ) : null}

      {form.formState.errors.root?.message ? (
        <FieldError message={form.formState.errors.root.message} />
      ) : null}

      <Button disabled={pending} onPress={() => void submit()}>
        {pending ? <ActivityIndicator color="white" size="small" /> : null}
        <Text>
          {authKind === 'oauth' ? '저장하고 OAuth 인증' : '연결 검증하고 추가'}
        </Text>
      </Button>
    </View>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <Text className="text-xs leading-5 text-destructive">{message}</Text>
  ) : null;
}
