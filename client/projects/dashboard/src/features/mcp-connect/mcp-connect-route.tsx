import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  useMcpAccessKeysControllerGetConnectionInfoSuspense,
  useMcpAccessKeysControllerListSuspense,
} from '@repo/client/api-client';
import type {
  McpAccessKey,
  McpConnectionInfo,
} from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import { McpAccessKeyCreateDialog } from '@core/features/mcp-connect/components/mcp-access-key-create-dialog';
import { McpAccessKeyEditDialog } from '@core/features/mcp-connect/components/mcp-access-key-edit-dialog';
import {
  formatMcpDate,
  summarizeMcpScopes,
} from '@core/features/mcp-connect/mcp-connect-presentation';
import { SettingsRouteFrame } from '@core/features/settings/settings-route-frame';

import { Copy, Plus } from 'lucide-react-native';

// 외부 AI 도구가 Work OS를 MCP 서버로 쓰도록 연결하는 화면이다.
export function McpConnectRoute() {
  return (
    <SettingsRouteFrame
      activeTab="connect"
      userContent={({ currentUserId }) => (
        <ScrollView
          className="min-h-0 flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="mx-auto w-full max-w-7xl gap-6 p-4 sm:p-6 lg:p-8">
            <Text className="text-xs leading-5 text-muted-foreground">
              Claude 같은 외부 AI 도구에서 Work OS의 위키, 프로젝트, 일정을 읽고
              바꿀 수 있게 연결합니다. 접근 키를 만들면 키가 포함된 연결 주소를
              받습니다. 그 주소를 외부 도구의 MCP 설정에 넣으면 됩니다.
            </Text>
            <DashboardQueryBoundary
              fallback={
                <DashboardLoading
                  className="min-h-48 flex-none"
                  label="연결 정보를 불러오는 중..."
                />
              }
              resetKeys={[currentUserId]}
              title="연결 정보를 불러오지 못했습니다"
            >
              <McpConnectContent />
            </DashboardQueryBoundary>
          </View>
        </ScrollView>
      )}
    />
  );
}

function McpConnectContent() {
  const info = useMcpAccessKeysControllerGetConnectionInfoSuspense().data;

  return (
    <>
      <ConnectionAddressSection info={info} />
      <AccessKeySection info={info} />
    </>
  );
}

function SectionHeader({
  action,
  description,
  title,
}: {
  action?: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <View className="flex-row items-end justify-between gap-3">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-xs font-semibold">{title}</Text>
        <Text className="text-[11px] leading-4 text-muted-foreground">
          {description}
        </Text>
      </View>
      {action}
    </View>
  );
}

function ConnectionAddressSection({ info }: { info: McpConnectionInfo }) {
  const { copyText, notifyError, notifySuccess } = useDashboardPlatform();

  const copy = async () => {
    try {
      await copyText(info.resourceUrl);
      notifySuccess({ title: 'MCP 주소를 복사했습니다.' });
    } catch {
      notifyError({ title: 'MCP 주소를 복사하지 못했습니다' });
    }
  };

  return (
    <View className="gap-2">
      <SectionHeader
        description="Work OS MCP 서버의 기본 주소입니다. 접근 키가 붙지 않은 주소라 이것만으로는 접속할 수 없습니다."
        title="MCP 주소"
      />
      <View className="flex-row items-center gap-2 rounded-lg border border-border px-3 py-1.5">
        <Text className="min-w-0 flex-1 truncate font-mono text-xs" selectable>
          {info.resourceUrl}
        </Text>
        <Button
          accessibilityLabel="MCP 주소 복사"
          className="h-7 gap-1.5 px-2"
          onPress={() => void copy()}
          size="sm"
          variant="outline"
        >
          <Icon as={Copy} className="size-3" />
          <Text className="text-[11px]">복사</Text>
        </Button>
      </View>
    </View>
  );
}

const HEADER_CELL = 'text-[11px] font-semibold text-muted-foreground';

function AccessKeySection({ info }: { info: McpConnectionInfo }) {
  const keys = useMcpAccessKeysControllerListSuspense({ limit: 100 }).data
    .items;
  const [createOpen, setCreateOpen] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const editing = keys.find(({ id }) => id === editingKeyId);

  return (
    <View className="gap-2">
      <SectionHeader
        action={
          <Button
            onPress={() => setCreateOpen(true)}
            size="sm"
            variant="outline"
          >
            <Icon as={Plus} className="size-3.5" />
            <Text className="text-xs">새 접근 키</Text>
          </Button>
        }
        description={`외부 도구가 나를 대신해 접속할 때 쓰는 비밀 값입니다. 키마다 권한과 조직을 정하며, AI 권한과 조직 AI 정책이 허용한 범위 안에서만 동작합니다. 최대 ${info.accessKey.maxActiveKeys}개까지 만들 수 있습니다.`}
        title="접근 키"
      />
      <View className="overflow-hidden rounded-lg border border-border">
        <View className="flex-row items-center gap-3 border-b border-border bg-muted/40 px-3 py-2">
          <Text className={cn(HEADER_CELL, 'min-w-0 flex-1')}>이름</Text>
          <Text className={cn(HEADER_CELL, 'hidden w-28 md:flex')}>권한</Text>
          <Text className={cn(HEADER_CELL, 'hidden w-24 sm:flex')}>만료</Text>
          <Text className={cn(HEADER_CELL, 'hidden w-24 lg:flex')}>
            마지막 사용
          </Text>
          <Text className={cn(HEADER_CELL, 'w-14')}>상태</Text>
        </View>
        {keys.length === 0 ? (
          <Text className="px-3 py-4 text-center text-xs text-muted-foreground">
            만든 접근 키가 없습니다
          </Text>
        ) : (
          keys.map((key, index) => (
            <AccessKeyRow
              first={index === 0}
              key={key.id}
              mcpKey={key}
              onEdit={() => setEditingKeyId(key.id)}
            />
          ))
        )}
      </View>

      {createOpen ? (
        <McpAccessKeyCreateDialog
          info={info}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
      {editing ? (
        <McpAccessKeyEditDialog
          info={info}
          key={editing.id}
          mcpKey={editing}
          onClose={() => setEditingKeyId(null)}
        />
      ) : null}
    </View>
  );
}

function AccessKeyRow({
  first,
  mcpKey,
  onEdit,
}: {
  first: boolean;
  mcpKey: McpAccessKey;
  onEdit: () => void;
}) {
  const status = mcpKey.expired ? '만료' : mcpKey.enabled ? '사용 중' : '꺼짐';
  return (
    <Pressable
      accessibilityLabel={`${mcpKey.name} 접근 키 수정`}
      className={cn(
        'min-h-10 flex-row items-center gap-3 px-3 py-1.5 web:hover:bg-accent/40',
        !first && 'border-t border-border/70',
      )}
      onPress={onEdit}
    >
      <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
        <Text className="shrink truncate text-xs font-medium">
          {mcpKey.name}
        </Text>
        <Text className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {mcpKey.start ?? mcpKey.prefix}…
        </Text>
      </View>
      <Text className="hidden w-28 text-xs text-muted-foreground md:flex">
        {summarizeMcpScopes(mcpKey.scopes)}
      </Text>
      <Text className="hidden w-24 text-xs text-muted-foreground sm:flex">
        {mcpKey.expiresAt ? formatMcpDate(mcpKey.expiresAt) : '없음'}
      </Text>
      <Text className="hidden w-24 text-xs text-muted-foreground lg:flex">
        {mcpKey.lastUsedAt ? formatMcpDate(mcpKey.lastUsedAt) : '없음'}
      </Text>
      <View className="w-14 flex-row items-center gap-1.5">
        <View
          className={cn(
            'size-1.5 rounded-full',
            mcpKey.expired
              ? 'bg-red-500'
              : mcpKey.enabled
                ? 'bg-emerald-500'
                : 'bg-muted-foreground/50',
          )}
        />
        <Text className="truncate text-xs">{status}</Text>
      </View>
    </Pressable>
  );
}
