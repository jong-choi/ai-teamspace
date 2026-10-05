import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import { WikiCreateDialog } from '@core/features/wiki/components/wiki-create-dialog';
import { WikiDeleteDialog } from '@core/features/wiki/components/wiki-delete-dialog';
import { WikiDocumentViewer } from '@core/features/wiki/components/wiki-document-viewer';
import { WikiHeader } from '@core/features/wiki/components/wiki-header';
import { WikiManageDialog } from '@core/features/wiki/components/wiki-manage-dialog';
import {
  WikiTree,
  type WikiTreeTarget,
} from '@core/features/wiki/components/wiki-tree';
import {
  useActiveOrganization,
  useWikiDocument,
  useWikiTree,
} from '@core/features/wiki/wiki-query';

import { BookOpenText } from 'lucide-react-native';

type WikiRouteProps = {
  documentId?: string;
};

type CreateRequest = {
  kind: 'folder' | 'document';
  parentFolderId: string | null;
};

export function WikiRoute({ documentId }: WikiRouteProps) {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  if (sessionPending) {
    return (
      <DashboardShell activeNavigationItem="wiki">
        <DashboardLoading label="세션을 확인하는 중..." />
      </DashboardShell>
    );
  }

  if (!currentUserId) {
    return (
      <DashboardShell activeNavigationItem="wiki">
        <DashboardState
          description="위키는 조직의 로그인 세션을 사용합니다. 먼저 로그인한 뒤 다시 열어 주세요."
          title="로그인이 필요합니다"
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardQueryBoundary
      fallback={
        <DashboardShell activeNavigationItem="wiki">
          <DashboardLoading label="활성 조직을 불러오는 중..." />
        </DashboardShell>
      }
      resetKeys={[currentUserId]}
      title="활성 조직을 불러오지 못했습니다"
    >
      <AuthenticatedWikiRoute documentId={documentId} />
    </DashboardQueryBoundary>
  );
}

function AuthenticatedWikiRoute({ documentId }: WikiRouteProps) {
  const activeOrganization = useActiveOrganization().data;

  return (
    <DashboardShell
      activeNavigationItem="wiki"
      organizationName={activeOrganization?.organization.name}
    >
      {!activeOrganization ? (
        <DashboardState
          description="위키는 활성 조직 범위에서 동작합니다. 조직을 선택한 뒤 다시 열어 주세요."
          title="활성 조직이 없습니다"
        />
      ) : (
        <DashboardQueryBoundary
          fallback={<DashboardLoading label="위키 탐색기를 불러오는 중..." />}
          resetKeys={[activeOrganization.organization.id]}
          title="위키를 불러오지 못했습니다"
        >
          <WikiWorkspace
            documentId={documentId}
            organizationId={activeOrganization.organization.id}
          />
        </DashboardQueryBoundary>
      )}
    </DashboardShell>
  );
}

function WikiWorkspace({
  documentId,
  organizationId,
}: {
  documentId?: string;
  organizationId: string;
}) {
  const router = useRouter();
  const tree = useWikiTree(organizationId).data;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createRequest, setCreateRequest] = useState<CreateRequest | null>(
    null,
  );
  const [manageTarget, setManageTarget] = useState<WikiTreeTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WikiTreeTarget | null>(null);
  const activeDocument = tree.documents.find((item) => item.id === documentId);

  useEffect(() => {
    if (documentId || tree.documents.length === 0) return;
    router.replace({
      pathname: '/wiki/[documentId]',
      params: { documentId: tree.documents[0].id },
    });
  }, [documentId, router, tree.documents]);

  const openWikiRoot = useCallback(() => {
    setDrawerOpen(false);
    router.replace('/wiki');
  }, [router]);
  const selectDocument = useCallback(
    (nextDocumentId: string) => {
      setDrawerOpen(false);
      router.push({
        pathname: '/wiki/[documentId]',
        params: { documentId: nextDocumentId },
      });
    },
    [router],
  );

  return (
    <View className="relative min-h-0 flex-1 overflow-hidden bg-background">
      <WikiHeader
        activeDocument={activeDocument}
        onOpenTree={() => setDrawerOpen(true)}
        onOpenWikiRoot={openWikiRoot}
        tree={tree}
      />
      <View className="relative min-h-0 flex-1 flex-row overflow-hidden">
        <WikiTree
          activeDocumentId={documentId}
          drawerOpen={drawerOpen}
          onCloseDrawer={() => setDrawerOpen(false)}
          onCreateDocument={(folderId) =>
            setCreateRequest({ kind: 'document', parentFolderId: folderId })
          }
          onCreateFolder={(parentFolderId) =>
            setCreateRequest({ kind: 'folder', parentFolderId })
          }
          onDeleteItem={setDeleteTarget}
          onManageItem={setManageTarget}
          onSelectDocument={selectDocument}
          tree={tree}
        />

        <Pressable
          accessibilityLabel="위키 탐색기 닫기"
          className={cn(
            'absolute inset-0 z-20 bg-zinc-950/50 md:hidden',
            drawerOpen ? 'flex' : 'hidden',
          )}
          onPress={() => setDrawerOpen(false)}
        />

        <View className="min-h-0 min-w-0 flex-1 bg-background">
          {documentId ? (
            <DashboardQueryBoundary
              fallback={<DashboardLoading label="문서를 불러오는 중..." />}
              resetKeys={[organizationId, documentId]}
              title="문서를 불러오지 못했습니다"
            >
              <WikiDocumentPane
                documentId={documentId}
                organizationId={organizationId}
              />
            </DashboardQueryBoundary>
          ) : tree.documents.length === 0 ? (
            <WikiLanding />
          ) : (
            <DashboardLoading label="첫 위키 문서를 여는 중..." />
          )}
        </View>
      </View>

      {createRequest ? (
        <WikiCreateDialog
          key={`${createRequest.kind}-${createRequest.parentFolderId ?? 'root'}`}
          kind={createRequest.kind}
          onCreatedDocument={selectDocument}
          onOpenChange={(open) => !open && setCreateRequest(null)}
          open
          organizationId={organizationId}
          parentFolderId={createRequest.parentFolderId}
        />
      ) : null}
      {manageTarget ? (
        <WikiManageDialog
          key={`${manageTarget.kind}-${manageTarget.item.id}`}
          onOpenChange={(open) => !open && setManageTarget(null)}
          open
          organizationId={organizationId}
          target={manageTarget}
          tree={tree}
        />
      ) : null}
      {deleteTarget ? (
        <WikiDeleteDialog
          key={`${deleteTarget.kind}-${deleteTarget.item.id}`}
          onDeletedDocument={(deletedDocumentId) => {
            if (deletedDocumentId === documentId) openWikiRoot();
          }}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          open
          organizationId={organizationId}
          target={deleteTarget}
        />
      ) : null}
    </View>
  );
}

function WikiDocumentPane({
  documentId,
  organizationId,
}: {
  documentId: string;
  organizationId: string;
}) {
  const document = useWikiDocument(organizationId, documentId).data;
  return <WikiDocumentViewer document={document} />;
}

function WikiLanding() {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <View className="mb-4 size-12 items-center justify-center rounded-xl bg-muted">
        <Icon as={BookOpenText} className="size-6 text-muted-foreground" />
      </View>
      <Text className="text-base font-semibold">
        첫 위키 문서를 만들어 보세요
      </Text>
      <Text className="mt-1 max-w-md text-center text-xs leading-5 text-muted-foreground">
        위키 탐색기에서 새 문서를 만들면 조직의 실제 Wiki tree에 바로
        반영됩니다.
      </Text>
    </View>
  );
}
