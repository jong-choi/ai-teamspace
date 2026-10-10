import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, ScrollView, View } from 'react-native';

import type {
  AgentMcpConnection,
  AgentMcpDiscoveredTool,
} from '@repo/client/api-client/schemas';
import { UpdateAgentMcpToolPolicy } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Label } from '@repo/client/rnr/components/ui/label';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import { DIALOG_WIDTH } from '@core/app/ui/dialog-width';
import {
  agentIntegrationErrorMessage,
  useAgentIntegrationMutations,
} from '@core/features/agent-integrations/agent-integrations-mutations';
import { safeAgentIntegrationExternalText as safeExternalText } from '@core/features/agent-integrations/agent-integrations-presentation';
import {
  useAgentMcpConnections,
  useAgentMcpTools,
} from '@core/features/agent-integrations/agent-integrations-query';
import { CreateAgentIntegrationForm } from '@core/features/agent-integrations/components/create-agent-integration-form';

import { Check, Plus } from 'lucide-react-native';

type ExternalMcpSectionProps = {
  openAuthorization: (url: string) => Promise<void>;
};

// AI 에이전트가 쓸 외부 MCP 서버 목록이다. 행을 누르면 수정 dialog, 버튼을 누르면 추가 dialog가 열린다.
export function ExternalMcpSection({
  openAuthorization,
}: ExternalMcpSectionProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(
    null,
  );

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-xs font-semibold">외부 MCP</Text>
        <Button onPress={() => setAddOpen(true)} size="sm" variant="outline">
          <Icon as={Plus} className="size-3.5" />
          <Text className="text-xs">새 MCP 연결</Text>
        </Button>
      </View>

      <DashboardQueryBoundary
        fallback={
          <DashboardLoading
            className="min-h-24 flex-none"
            label="MCP 목록을 불러오는 중..."
          />
        }
        title="MCP 목록을 불러오지 못했습니다"
      >
        <ConnectionTable
          editingConnectionId={editingConnectionId}
          onEdit={setEditingConnectionId}
          openAuthorization={openAuthorization}
        />
      </DashboardQueryBoundary>

      {addOpen ? (
        <Dialog onOpenChange={setAddOpen} open>
          <DialogContent className={DIALOG_WIDTH.lg}>
            <DialogHeader>
              <DialogTitle>새 MCP 연결</DialogTitle>
            </DialogHeader>
            <CreateAgentIntegrationForm
              onCreated={(connection) => {
                setAddOpen(false);
                setEditingConnectionId(connection.id);
              }}
              openAuthorization={openAuthorization}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </View>
  );
}

function ConnectionTable({
  editingConnectionId,
  onEdit,
  openAuthorization,
}: {
  editingConnectionId: string | null;
  onEdit: (id: string | null) => void;
  openAuthorization: (url: string) => Promise<void>;
}) {
  const connections = useAgentMcpConnections().data.items;
  const editing = connections.find(({ id }) => id === editingConnectionId);

  return (
    <>
      <View className="overflow-hidden rounded-lg border border-border">
        <View className="flex-row items-center gap-3 border-b border-border bg-muted/40 px-3 py-2">
          <Text className={cn(HEADER_CELL, 'min-w-0 flex-1')}>MCP</Text>
          <Text className={cn(HEADER_CELL, 'hidden w-20 md:flex')}>인증</Text>
          <Text className={cn(HEADER_CELL, 'w-20')}>상태</Text>
          <Text className={cn(HEADER_CELL, 'hidden w-12 text-right sm:flex')}>
            도구
          </Text>
          <View className="w-14" />
        </View>
        {connections.length === 0 ? (
          <Text className="px-3 py-4 text-center text-xs text-muted-foreground">
            연결한 MCP가 없습니다
          </Text>
        ) : (
          connections.map((connection, index) => (
            <ConnectionRow
              connection={connection}
              first={index === 0}
              key={connection.id}
              onEdit={() => onEdit(connection.id)}
              openAuthorization={openAuthorization}
            />
          ))
        )}
      </View>

      {editing ? (
        <ConnectionEditDialog
          connection={editing}
          key={editing.id}
          onClose={() => onEdit(null)}
          openAuthorization={openAuthorization}
        />
      ) : null}
    </>
  );
}

const HEADER_CELL = 'text-[11px] font-semibold text-muted-foreground';

function useConnectionActions(
  connection: AgentMcpConnection,
  openAuthorization: (url: string) => Promise<void>,
) {
  const mutations = useAgentIntegrationMutations();
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const busy =
    mutations.remove.isPending ||
    mutations.startOauth.isPending ||
    mutations.testConnection.isPending ||
    mutations.update.isPending;
  const canTest =
    connection.authKind === 'none' || connection.credentialConfigured;
  const canEnable =
    canTest &&
    connection.lastTestedAt !== null &&
    connection.lastErrorCategory === null;

  const runTest = async () => {
    try {
      const result = await mutations.testConnection.mutateAsync({
        connectionId: connection.id,
      });
      notifySuccess({
        title: 'MCP 연결을 확인했습니다.',
        description: String(result.toolCount) + '개 도구를 발견했습니다.',
      });
    } catch (error) {
      notifyError({
        id: 'agent-mcp-test-' + connection.id,
        title: 'MCP 연결을 확인하지 못했습니다',
        description: agentIntegrationErrorMessage(
          error,
          '서버 상태와 인증 정보를 확인한 뒤 다시 시도해 주세요.',
        ),
      });
    }
  };

  const authorize = async () => {
    try {
      const authorization = await mutations.startOauth.mutateAsync({
        connectionId: connection.id,
      });
      await openAuthorization(authorization.authorizationUrl);
      await mutations.refreshConnection(connection.id);
    } catch (error) {
      notifyError({
        id: 'agent-mcp-oauth-' + connection.id,
        title: 'OAuth 인증을 시작하지 못했습니다',
        description: agentIntegrationErrorMessage(
          error,
          'MCP OAuth 설정을 확인해 주세요.',
        ),
      });
    }
  };

  const toggleEnabled = async () => {
    try {
      await mutations.update.mutateAsync({
        connectionId: connection.id,
        data: {
          enabled: !connection.enabled,
          expectedRevision: connection.revision,
        },
      });
      notifySuccess({
        title: connection.enabled ? 'MCP를 껐습니다.' : 'MCP를 켰습니다.',
      });
    } catch (error) {
      notifyError({
        id: 'agent-mcp-enable-' + connection.id,
        title: 'MCP 상태를 바꾸지 못했습니다',
        description: agentIntegrationErrorMessage(
          error,
          '최신 연결 상태를 다시 확인해 주세요.',
        ),
      });
    }
  };

  const remove = async () => {
    try {
      await mutations.remove.mutateAsync({
        connectionId: connection.id,
        params: { expectedRevision: connection.revision },
      });
    } catch (error) {
      notifyError({
        id: 'agent-mcp-remove-' + connection.id,
        title: 'MCP를 삭제하지 못했습니다',
        description: agentIntegrationErrorMessage(
          error,
          '최신 연결 상태를 다시 확인해 주세요.',
        ),
      });
    }
  };

  return {
    authorize,
    busy,
    canEnable,
    canTest,
    remove,
    runTest,
    toggleEnabled,
    update: mutations.update,
  };
}

function ConnectionRow({
  connection,
  first,
  onEdit,
  openAuthorization,
}: {
  connection: AgentMcpConnection;
  first: boolean;
  onEdit: () => void;
  openAuthorization: (url: string) => Promise<void>;
}) {
  const actions = useConnectionActions(connection, openAuthorization);
  const needsOauth =
    connection.authKind === 'oauth' && !connection.credentialConfigured;

  return (
    <Pressable
      accessibilityLabel={`${safeExternalText(connection.displayName, 100)} 수정`}
      className={cn(
        'min-h-10 flex-row items-center gap-3 px-3 py-1.5 web:hover:bg-accent/40',
        !first && 'border-t border-border/70',
      )}
      onPress={onEdit}
    >
      <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
        <Text className="shrink truncate text-xs font-medium">
          {safeExternalText(connection.displayName, 100)}
        </Text>
        <Text className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {safeExternalText(connection.publicHost, 255)}
        </Text>
      </View>
      <Text className="hidden w-20 text-xs text-muted-foreground md:flex">
        {AUTH_KIND_LABELS[connection.authKind]}
      </Text>
      <ConnectionStatus className="w-20" connection={connection} />
      <Text className="hidden w-12 text-right text-xs text-muted-foreground sm:flex">
        {connection.toolPolicy.selectedToolCount}
      </Text>
      <View className="w-14 items-end">
        {needsOauth ? (
          <Button
            className="h-7 px-2"
            disabled={actions.busy}
            onPress={() => void actions.authorize()}
            size="sm"
            variant="outline"
          >
            <Text className="text-[11px]">인증</Text>
          </Button>
        ) : (
          <Button
            accessibilityLabel={connection.enabled ? 'MCP 끄기' : 'MCP 켜기'}
            accessibilityState={{ checked: connection.enabled }}
            className="h-7 px-2"
            disabled={
              actions.busy || (!connection.enabled && !actions.canEnable)
            }
            onPress={() => void actions.toggleEnabled()}
            size="sm"
            variant={connection.enabled ? 'secondary' : 'outline'}
          >
            <Text className="text-[11px]">
              {connection.enabled ? '사용 중' : '사용'}
            </Text>
          </Button>
        )}
      </View>
    </Pressable>
  );
}

function ConnectionStatus({
  className,
  connection,
}: {
  className?: string;
  connection: AgentMcpConnection;
}) {
  return (
    <View className={cn('flex-row items-center gap-1.5', className)}>
      <View
        className={cn(
          'size-1.5 rounded-full',
          STATUS_DOT_CLASSES[connection.status],
        )}
      />
      <Text className="truncate text-xs">
        {STATUS_LABELS[connection.status]}
      </Text>
    </View>
  );
}

// MCP 하나의 이름·주소 수정, 연결 검사, 도구 선택, 삭제를 한 곳에서 한다.
function ConnectionEditDialog({
  connection,
  onClose,
  openAuthorization,
}: {
  connection: AgentMcpConnection;
  onClose: () => void;
  openAuthorization: (url: string) => Promise<void>;
}) {
  const actions = useConnectionActions(connection, openAuthorization);
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const [displayName, setDisplayName] = useState(connection.displayName);
  // 서버는 저장된 주소 전체를 돌려주지 않는다. 주소는 바꿀 때만 새로 입력한다.
  const [endpoint, setEndpoint] = useState('');
  const nameChanged = displayName.trim() !== connection.displayName;
  const endpointChanged = endpoint.trim().length > 0;
  const canSave =
    (nameChanged || endpointChanged) && displayName.trim().length > 0;

  const save = async () => {
    if (!nameChanged && !endpointChanged) {
      notifySuccess({ title: '변경 사항이 없습니다' });
      return;
    }
    if (!canSave) {
      notifyError({ title: 'MCP 이름을 입력해 주세요' });
      return;
    }
    try {
      await actions.update.mutateAsync({
        connectionId: connection.id,
        data: {
          ...(nameChanged ? { displayName: displayName.trim() } : {}),
          ...(endpointChanged ? { endpoint: endpoint.trim() } : {}),
          expectedRevision: connection.revision,
        },
      });
      setEndpoint('');
      notifySuccess({ title: 'MCP를 저장했습니다.' });
    } catch (error) {
      notifyError({
        id: 'agent-mcp-update-' + connection.id,
        title: 'MCP를 수정하지 못했습니다',
        description: agentIntegrationErrorMessage(
          error,
          '이름과 주소를 확인한 뒤 다시 시도해 주세요.',
        ),
      });
    }
  };

  const removeAndClose = async () => {
    await actions.remove();
    onClose();
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className={cn('max-h-[90vh]', DIALOG_WIDTH.xl)}>
        <DialogHeader className="flex-row items-center gap-3 pr-8">
          <DialogTitle>MCP 수정</DialogTitle>
          <ConnectionStatus connection={connection} />
        </DialogHeader>

        <View className="gap-3">
          <View className="gap-1.5">
            <Label nativeID="mcp-edit-name">이름</Label>
            <Input
              accessibilityLabel="MCP 이름"
              className="h-9 text-xs md:text-xs"
              editable={!actions.busy}
              maxLength={100}
              onChangeText={setDisplayName}
              value={displayName}
            />
          </View>
          <View className="gap-1.5">
            <Label nativeID="mcp-edit-endpoint">MCP 주소</Label>
            <Input
              accessibilityLabel="MCP 주소"
              autoCapitalize="none"
              className="h-9 text-xs md:text-xs"
              editable={!actions.busy}
              keyboardType="url"
              onChangeText={setEndpoint}
              placeholder={`${safeExternalText(connection.publicHost, 255)} · 바꿀 때만 입력`}
              value={endpoint}
            />
          </View>
          <Text className="text-[11px] text-muted-foreground">
            마지막 검사 {formatLastTested(connection.lastTestedAt)}
          </Text>
          {connection.lastErrorCategory ? (
            <Text className="text-[11px] text-destructive">
              마지막 오류: {ERROR_CATEGORY_LABELS[connection.lastErrorCategory]}
            </Text>
          ) : null}
        </View>

        {actions.canTest ? (
          <View className="gap-1.5">
            <Text className="text-xs font-medium">도구</Text>
            <DashboardQueryBoundary
              fallback={
                <DashboardLoading
                  className="min-h-24 flex-none"
                  label="도구를 불러오는 중..."
                />
              }
              resetKeys={[connection.id, connection.revision]}
              title="도구를 불러오지 못했습니다"
            >
              <ConnectionToolsPanel connection={connection} />
            </DashboardQueryBoundary>
          </View>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <Button
            disabled={actions.busy}
            onPress={() => void removeAndClose()}
            variant="ghost"
          >
            <Text className="text-destructive">삭제</Text>
          </Button>
          <View className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              disabled={actions.busy || !actions.canTest}
              onPress={() => void actions.runTest()}
              variant="outline"
            >
              <Text>연결 검사</Text>
            </Button>
            <Button disabled={actions.busy} onPress={() => void save()}>
              <Text className="text-primary-foreground">저장</Text>
            </Button>
          </View>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionToolsPanel({
  connection,
}: {
  connection: AgentMcpConnection;
}) {
  const catalog = useAgentMcpTools(connection.id).data;
  const mutations = useAgentIntegrationMutations();
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const form = useForm<{ selectedToolNames: string[] }>({
    defaultValues: {
      selectedToolNames: catalog.tools
        .filter((tool) => tool.selected)
        .map((tool) => tool.originalToolName),
    },
  });
  const selectedToolNames = form.watch('selectedToolNames');

  useEffect(() => {
    if (!form.formState.isDirty) {
      form.reset({
        selectedToolNames: catalog.tools
          .filter((tool) => tool.selected)
          .map((tool) => tool.originalToolName),
      });
    }
  }, [catalog.tools, connection.revision, form, form.formState.isDirty]);

  const toggleTool = (tool: AgentMcpDiscoveredTool) => {
    const current = form.getValues('selectedToolNames');
    const next = current.includes(tool.originalToolName)
      ? current.filter((name) => name !== tool.originalToolName)
      : [...current, tool.originalToolName];
    form.setValue('selectedToolNames', next, {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const submit = form.handleSubmit(async ({ selectedToolNames: selected }) => {
    const input = UpdateAgentMcpToolPolicy.safeParse({
      expectedRevision: connection.revision,
      mode: 'selected',
      tools: catalog.tools
        .filter((tool) => selected.includes(tool.originalToolName))
        .map((tool) => ({
          enabled: true,
          originalToolName: tool.originalToolName,
          schemaFingerprint: tool.schemaFingerprint,
        })),
    });
    if (!input.success) {
      form.setError('root', {
        message: input.error.issues[0]?.message ?? '도구 선택을 확인해 주세요.',
      });
      return;
    }

    try {
      await mutations.updateToolPolicy.mutateAsync({
        connectionId: connection.id,
        data: input.data,
      });
      form.reset({ selectedToolNames: selected });
      notifySuccess({ title: '도구 선택을 저장했습니다.' });
    } catch (error) {
      const message = agentIntegrationErrorMessage(
        error,
        '도구 목록이 바뀌었을 수 있습니다. 최신 목록을 확인한 뒤 다시 저장해 주세요.',
      );
      form.setError('root', { message });
      notifyError({
        id: 'agent-mcp-policy-' + connection.id,
        title: 'MCP 도구 선택을 저장하지 못했습니다',
        description: message,
      });
    }
  });

  const saving = mutations.updateToolPolicy.isPending;

  return (
    <View className="gap-2">
      {catalog.tools.length === 0 ? (
        <Text className="text-xs text-muted-foreground">
          이 MCP가 제공하는 도구가 없습니다.
        </Text>
      ) : (
        <ScrollView className="max-h-56 rounded-md border border-border bg-background">
          {catalog.tools.map((tool, index) => {
            const selected = selectedToolNames.includes(tool.originalToolName);
            const hints = externalToolHints(tool);
            return (
              <Pressable
                accessibilityLabel={safeExternalText(
                  tool.title ?? tool.originalToolName,
                  256,
                )}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: saving }}
                className={cn(
                  'min-h-9 flex-row items-center gap-2.5 px-2.5 py-1.5 web:hover:bg-accent/40',
                  index > 0 && 'border-t border-border/60',
                )}
                disabled={saving}
                key={[tool.originalToolName, tool.schemaFingerprint].join(':')}
                onPress={() => toggleTool(tool)}
              >
                <View
                  className={cn(
                    'size-4 items-center justify-center rounded border border-input',
                    selected && 'border-primary bg-primary',
                  )}
                >
                  {selected ? (
                    <Icon
                      as={Check}
                      className="size-3 text-primary-foreground"
                    />
                  ) : null}
                </View>
                <Text className="max-w-[40%] shrink-0 truncate text-xs font-medium">
                  {safeExternalText(tool.title ?? tool.originalToolName, 256)}
                </Text>
                <Text
                  className="min-w-0 flex-1 text-[11px] text-muted-foreground"
                  numberOfLines={1}
                >
                  {tool.description
                    ? safeExternalText(tool.description, 4096)
                    : ''}
                </Text>
                {tool.schemaChanged ? (
                  <Text className="text-[11px] font-medium text-destructive">
                    형식 변경됨
                  </Text>
                ) : null}
                {hints.length > 0 ? (
                  <Text className="hidden text-[11px] text-muted-foreground lg:flex">
                    {hints.join(' · ')}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {form.formState.errors.root?.message ? (
        <Text className="text-xs leading-5 text-destructive">
          {form.formState.errors.root.message}
        </Text>
      ) : null}

      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[11px] text-muted-foreground">
          {selectedToolNames.length}개 선택
        </Text>
        <Button
          disabled={saving}
          onPress={() => {
            if (!form.formState.isDirty) {
              notifySuccess({ title: '변경 사항이 없습니다' });
              return;
            }
            void submit();
          }}
          size="sm"
          variant="outline"
        >
          <Text className="text-xs">{saving ? '저장 중...' : '도구 저장'}</Text>
        </Button>
      </View>
    </View>
  );
}

const STATUS_DOT_CLASSES: Record<AgentMcpConnection['status'], string> = {
  authorization_required: 'bg-amber-500',
  credential_expired: 'bg-amber-500',
  disabled: 'bg-muted-foreground/50',
  ready: 'bg-emerald-500',
  test_failed: 'bg-red-500',
  unavailable: 'bg-red-500',
};

const STATUS_LABELS: Record<AgentMcpConnection['status'], string> = {
  authorization_required: '인증 필요',
  credential_expired: '인증 만료',
  disabled: '꺼짐',
  ready: '정상',
  test_failed: '검사 실패',
  unavailable: '사용 불가',
};

const AUTH_KIND_LABELS: Record<AgentMcpConnection['authKind'], string> = {
  bearer: 'Bearer',
  none: '인증 없음',
  oauth: 'OAuth',
};

const ERROR_CATEGORY_LABELS: Record<
  NonNullable<AgentMcpConnection['lastErrorCategory']>,
  string
> = {
  authorization_required: '인증 필요',
  cancelled: '요청 취소',
  connection_unavailable: '서버 연결 불가',
  credential_expired: 'credential 만료',
  discovery_failed: '도구 discovery 실패',
  protocol_incompatible: '지원하지 않는 MCP protocol',
  response_too_large: '응답 크기 초과',
  tool_error: '도구 오류',
  tool_not_allowed: '허용되지 않은 도구',
  tool_timeout: '도구 시간 초과',
};

function formatLastTested(value: string | null): string {
  if (!value) return '아직 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '확인 불가';
  return date.toLocaleString();
}

function externalToolHints(tool: AgentMcpDiscoveredTool): string[] {
  const hints: string[] = [];
  if (tool.annotations?.readOnlyHint) hints.push('읽기 전용');
  if (tool.annotations?.destructiveHint) hints.push('파괴적 작업 가능');
  if (tool.annotations?.idempotentHint) hints.push('멱등성 주장');
  if (tool.annotations?.openWorldHint) hints.push('외부 시스템 접근 주장');
  return hints;
}
