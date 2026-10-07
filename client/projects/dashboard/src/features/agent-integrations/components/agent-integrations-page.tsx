import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type {
  AgentMcpConnection,
  AgentMcpDiscoveredTool,
} from '@repo/client/api-client/schemas';
import { UpdateAgentMcpToolPolicy } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import { CreateAgentIntegrationForm } from '@core/features/agent-integrations/components/create-agent-integration-form';
import {
  agentIntegrationErrorMessage,
  useAgentIntegrationMutations,
} from '@core/features/agent-integrations/agent-integrations-mutations';
import { safeAgentIntegrationExternalText as safeExternalText } from '@core/features/agent-integrations/agent-integrations-presentation';
import {
  useAgentMcpConnections,
  useAgentMcpTools,
} from '@core/features/agent-integrations/agent-integrations-query';

import { useForm } from 'react-hook-form';

type AgentIntegrationsPageProps = {
  openAuthorization: (url: string) => Promise<void>;
};

export function AgentIntegrationsPage({
  openAuthorization,
}: AgentIntegrationsPageProps) {
  const connections = useAgentMcpConnections().data.items;
  const [expandedConnectionId, setExpandedConnectionId] = useState<
    string | null
  >(null);

  return (
    <View className="gap-5">
      <View className="gap-1">
        <Text className="text-xl font-semibold tracking-tight">
          Agent 외부 연결
        </Text>
        <Text className="text-sm leading-6 text-muted-foreground">
          외부 MCP 서버를 Agent 도구로 연결합니다. 서버 제공 annotation은
          힌트로만 표시하며 모든 외부 도구 호출은 별도 승인 대상입니다.
        </Text>
      </View>

      <CreateAgentIntegrationForm
        onCreated={(connection) => setExpandedConnectionId(connection.id)}
        openAuthorization={openAuthorization}
      />

      {connections.length === 0 ? (
        <DashboardState
          description="등록한 외부 MCP 연결이 없습니다. 위 폼에서 HTTPS endpoint를 추가해 주세요."
          title="외부 연결이 없습니다"
        />
      ) : (
        <View className="gap-3">
          {connections.map((connection) => (
            <ConnectionCard
              connection={connection}
              expanded={expandedConnectionId === connection.id}
              key={connection.id}
              onToggleTools={() =>
                setExpandedConnectionId((current) =>
                  current === connection.id ? null : connection.id,
                )
              }
              openAuthorization={openAuthorization}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function ConnectionCard({
  connection,
  expanded,
  onToggleTools,
  openAuthorization,
}: {
  connection: AgentMcpConnection;
  expanded: boolean;
  onToggleTools: () => void;
  openAuthorization: (url: string) => Promise<void>;
}) {
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
        title: '외부 MCP 연결을 확인했습니다.',
        description: String(result.toolCount) + '개 도구를 발견했습니다.',
      });
    } catch (error) {
      notifyError({
        id: 'agent-mcp-test-' + connection.id,
        title: '외부 MCP 연결을 확인하지 못했습니다',
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
          '외부 MCP OAuth 설정을 확인해 주세요.',
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
        title: connection.enabled
          ? '외부 MCP 연결을 비활성화했습니다.'
          : '외부 MCP 연결을 Agent에서 사용하도록 활성화했습니다.',
      });
    } catch (error) {
      notifyError({
        id: 'agent-mcp-enable-' + connection.id,
        title: '외부 MCP 상태를 변경하지 못했습니다',
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
        title: '외부 MCP 연결을 삭제하지 못했습니다',
        description: agentIntegrationErrorMessage(
          error,
          '최신 연결 상태를 다시 확인해 주세요.',
        ),
      });
    }
  };

  return (
    <View className="gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <View className="flex-row flex-wrap items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-base font-semibold">
            {safeExternalText(connection.displayName, 100)}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {safeExternalText(connection.publicHost, 255)} ·{' '}
            {AUTH_KIND_LABELS[connection.authKind]}
          </Text>
        </View>
        <View className="rounded-full bg-secondary px-2.5 py-1">
          <Text className="text-[11px] font-medium">
            {STATUS_LABELS[connection.status]}
          </Text>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        <Text className="text-[11px] text-muted-foreground">
          credential {connection.credentialConfigured ? '설정됨' : '미설정'}
        </Text>
        <Text className="text-[11px] text-muted-foreground">
          선택 도구 {connection.toolPolicy.selectedToolCount}개
        </Text>
        <Text className="text-[11px] text-muted-foreground">
          마지막 검사 {formatLastTested(connection.lastTestedAt)}
        </Text>
      </View>

      {connection.lastErrorCategory ? (
        <Text className="text-xs leading-5 text-destructive">
          마지막 오류: {ERROR_CATEGORY_LABELS[connection.lastErrorCategory]}
        </Text>
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        {connection.authKind === 'oauth' && !connection.credentialConfigured ? (
          <Button
            disabled={busy}
            onPress={() => void authorize()}
            size="sm"
            variant="secondary"
          >
            <Text>OAuth 인증</Text>
          </Button>
        ) : null}
        <Button
          disabled={busy || !canTest}
          onPress={() => void runTest()}
          size="sm"
          variant="outline"
        >
          <Text>연결 검사</Text>
        </Button>
        <Button
          disabled={busy || !canTest}
          onPress={onToggleTools}
          size="sm"
          variant="outline"
        >
          <Text>{expanded ? '도구 닫기' : '도구 선택'}</Text>
        </Button>
        <Button
          disabled={busy || (!connection.enabled && !canEnable)}
          onPress={() => void toggleEnabled()}
          size="sm"
          variant={connection.enabled ? 'secondary' : 'default'}
        >
          <Text>{connection.enabled ? '비활성화' : 'Agent에서 사용'}</Text>
        </Button>
        <Button
          disabled={busy}
          onPress={() => void remove()}
          size="sm"
          variant="destructive"
        >
          <Text>삭제</Text>
        </Button>
      </View>

      {!connection.enabled && canTest && !canEnable ? (
        <Text className="text-[11px] leading-4 text-muted-foreground">
          활성화하기 전에 연결 검사를 성공시켜 주세요.
        </Text>
      ) : null}

      {expanded ? (
        <DashboardQueryBoundary
          fallback={<DashboardLoading label="외부 MCP 도구를 불러오는 중..." />}
          resetKeys={[connection.id, connection.revision]}
          title="외부 MCP 도구를 불러오지 못했습니다"
        >
          <ConnectionToolsPanel connection={connection} />
        </DashboardQueryBoundary>
      ) : null}
    </View>
  );
}

function ConnectionToolsPanel({
  connection,
}: {
  connection: AgentMcpConnection;
}) {
  const catalog = useAgentMcpTools(connection.id).data;
  const mutations = useAgentIntegrationMutations();
  const { notifyError } = useDashboardPlatform();
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
    } catch (error) {
      const message = agentIntegrationErrorMessage(
        error,
        '도구 목록이 바뀌었을 수 있습니다. 최신 목록을 확인한 뒤 다시 저장해 주세요.',
      );
      form.setError('root', { message });
      notifyError({
        id: 'agent-mcp-policy-' + connection.id,
        title: '외부 MCP 도구 선택을 저장하지 못했습니다',
        description: message,
      });
    }
  });

  return (
    <View className="gap-3 border-t border-border pt-4">
      <View className="gap-1">
        <Text className="text-sm font-semibold">
          {safeExternalText(catalog.serverName ?? connection.displayName, 256)}
        </Text>
        {catalog.serverVersion ? (
          <Text className="text-[11px] text-muted-foreground">
            서버 버전 {safeExternalText(catalog.serverVersion, 128)}
          </Text>
        ) : null}
        <Text className="text-xs leading-5 text-muted-foreground">
          선택한 도구만 Agent에 노출됩니다. 외부 서버가 제공한 annotation은 신뢰
          기반 권한으로 사용하지 않습니다.
        </Text>
      </View>

      {catalog.tools.length === 0 ? (
        <Text className="text-xs text-muted-foreground">
          이 서버가 노출한 도구가 없습니다.
        </Text>
      ) : (
        <View className="gap-2">
          {catalog.tools.map((tool) => {
            const selected = selectedToolNames.includes(tool.originalToolName);
            const hints = externalToolHints(tool);
            return (
              <View
                className="gap-2 rounded-lg border border-border bg-background p-3"
                key={[tool.originalToolName, tool.schemaFingerprint].join(':')}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="text-sm font-medium">
                      {safeExternalText(
                        tool.title ?? tool.originalToolName,
                        256,
                      )}
                    </Text>
                    {tool.title ? (
                      <Text className="text-[11px] text-muted-foreground">
                        {safeExternalText(tool.originalToolName, 256)}
                      </Text>
                    ) : null}
                  </View>
                  <Button
                    disabled={mutations.updateToolPolicy.isPending}
                    onPress={() => toggleTool(tool)}
                    size="sm"
                    variant={selected ? 'secondary' : 'outline'}
                  >
                    <Text>{selected ? '선택됨' : '사용'}</Text>
                  </Button>
                </View>

                {tool.description ? (
                  <Text
                    className="text-xs leading-5 text-muted-foreground"
                    numberOfLines={3}
                  >
                    {safeExternalText(tool.description, 4096)}
                  </Text>
                ) : null}

                {tool.schemaChanged ? (
                  <Text className="text-xs leading-5 text-destructive">
                    입력 schema가 이전 승인 이후 변경되었습니다. 내용을 검토하고
                    다시 선택하면 새 fingerprint로 승인됩니다.
                  </Text>
                ) : null}

                {hints.length > 0 ? (
                  <Text className="text-[11px] leading-4 text-muted-foreground">
                    서버 제공 힌트 · {hints.join(' · ')}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {form.formState.errors.root?.message ? (
        <Text className="text-xs leading-5 text-destructive">
          {form.formState.errors.root.message}
        </Text>
      ) : null}

      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[11px] text-muted-foreground">
          {selectedToolNames.length}개 선택 · revision {connection.revision}
        </Text>
        <Button
          disabled={
            !form.formState.isDirty || mutations.updateToolPolicy.isPending
          }
          onPress={() => void submit()}
          size="sm"
        >
          {mutations.updateToolPolicy.isPending ? (
            <ActivityIndicator color="white" size="small" />
          ) : null}
          <Text>도구 선택 저장</Text>
        </Button>
      </View>
    </View>
  );
}

const STATUS_LABELS: Record<AgentMcpConnection['status'], string> = {
  authorization_required: '인증 필요',
  credential_expired: 'credential 만료',
  disabled: '비활성화',
  ready: '마지막 검사 성공',
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
