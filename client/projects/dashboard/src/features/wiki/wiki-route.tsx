import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';

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
import { AuthenticationRequiredState } from '@core/features/auth/authentication-required-state';
import { useWikiCollaborationPlatform } from '@core/features/wiki/collaboration/wiki-collaboration-platform';
import { WikiCreateDialog } from '@core/features/wiki/components/wiki-create-dialog';
import { WikiDeleteDialog } from '@core/features/wiki/components/wiki-delete-dialog';
import { WikiDocumentWorkspace } from '@core/features/wiki/components/wiki-document-workspace';
import { WikiHeader } from '@core/features/wiki/components/wiki-header';
import { WikiManageDialog } from '@core/features/wiki/components/wiki-manage-dialog';
import {
  WikiTree,
  type WikiTreeTarget,
} from '@core/features/wiki/components/wiki-tree';
import {
  useActiveOrganization,
  useWikiTree,
} from '@core/features/wiki/wiki-query';

import { BookOpenText } from 'lucide-react-native';

type WikiRouteProps = {
  documentId?: string;
};

type CreateRequest = {
  parentDocumentId: string | null;
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
        <AuthenticationRequiredState />
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
  const navigation = useNavigation();
  const { clearLocalStore } = useWikiCollaborationPlatform();
  const tree = useWikiTree(organizationId).data;
  const beforeNavigateRef = useRef<(() => Promise<boolean>) | null>(null);
  const afterDeleteRef = useRef<(() => Promise<void>) | null>(null);
  const allowNextRemovalRef = useRef(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createRequest, setCreateRequest] = useState<CreateRequest | null>(
    null,
  );
  const [manageTarget, setManageTarget] = useState<WikiTreeTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WikiTreeTarget | null>(null);

  useEffect(() => {
    if (documentId || tree.documents.length === 0) return;
    router.replace({
      pathname: '/wiki/[documentId]',
      params: { documentId: tree.documents[0].id },
    });
  }, [documentId, router, tree.documents]);

  const navigateDocument = useCallback(
    (nextDocumentId: string) => {
      setDrawerOpen(false);
      router.push({
        pathname: '/wiki/[documentId]',
        params: { documentId: nextDocumentId },
      });
    },
    [router],
  );

  const selectDocument = useCallback(
    async (nextDocumentId: string) => {
      if (nextDocumentId === documentId) {
        setDrawerOpen(false);
        return;
      }
      const canNavigate = (await beforeNavigateRef.current?.()) ?? true;
      if (!canNavigate) return;
      beforeNavigateRef.current = null;
      navigateDocument(nextDocumentId);
    },
    [documentId, navigateDocument],
  );

  const openWikiRoot = useCallback(async () => {
    const canNavigate = (await beforeNavigateRef.current?.()) ?? true;
    if (!canNavigate) return;
    beforeNavigateRef.current = null;
    setDrawerOpen(false);
    router.replace('/wiki');
  }, [router]);

  const registerBeforeNavigate = useCallback(
    (handler: (() => Promise<boolean>) | null) => {
      beforeNavigateRef.current = handler;
    },
    [],
  );
  const registerAfterDelete = useCallback(
    (handler: (() => Promise<void>) | null) => {
      afterDeleteRef.current = handler;
    },
    [],
  );

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (allowNextRemovalRef.current) {
          allowNextRemovalRef.current = false;
          return;
        }

        const beforeNavigate = beforeNavigateRef.current;
        if (!beforeNavigate) return;

        event.preventDefault();
        void beforeNavigate().then((canNavigate) => {
          if (!canNavigate) return;
          allowNextRemovalRef.current = true;
          navigation.dispatch(event.data.action);
        });
      }),
    [navigation],
  );

  return (
    <View className="relative min-h-0 flex-1 overflow-hidden bg-background">
      {documentId ? (
        <DashboardQueryBoundary
          fallback={
            <View className="min-h-0 flex-1">
              <WikiHeader
                tree={tree}
                activeDocument={tree.documents.find(
                  (document) => document.id === documentId,
                )}
                onOpenTree={() => setDrawerOpen(true)}
                onOpenWikiRoot={() => void openWikiRoot()}
              />
              <View className="min-h-0 flex-1 flex-row">
                <WikiTree
                  activeDocumentId={documentId}
                  drawerOpen={drawerOpen}
                  onCloseDrawer={() => setDrawerOpen(false)}
                  onCreateDocument={(parentDocumentId) =>
                    setCreateRequest({ parentDocumentId })
                  }
                  onDeleteItem={setDeleteTarget}
                  onManageItem={setManageTarget}
                  onSelectDocument={(id) => void selectDocument(id)}
                  tree={tree}
                />
                <DashboardLoading label="문서 본문을 불러오는 중..." />
              </View>
            </View>
          }
          resetKeys={[organizationId, documentId]}
          title="문서를 불러오지 못했습니다"
        >
          <WikiDocumentWorkspace
            key={documentId}
            documentId={documentId}
            drawerOpen={drawerOpen}
            onCloseDrawer={() => setDrawerOpen(false)}
            onCreateDocument={(parentDocumentId) =>
              setCreateRequest({ parentDocumentId })
            }
            onDeleteItem={setDeleteTarget}
            onManageItem={setManageTarget}
            onNavigateDocument={(nextDocumentId) =>
              void selectDocument(nextDocumentId)
            }
            onOpenTree={() => setDrawerOpen(true)}
            onOpenWikiRoot={() => void openWikiRoot()}
            onRegisterAfterDelete={registerAfterDelete}
            onRegisterBeforeNavigate={registerBeforeNavigate}
            organizationId={organizationId}
            tree={tree}
          />
        </DashboardQueryBoundary>
      ) : (
        <>
          <WikiHeader
            onOpenTree={() => setDrawerOpen(true)}
            onOpenWikiRoot={() => void openWikiRoot()}
            tree={tree}
          />
          <View className="relative min-h-0 flex-1 flex-row overflow-hidden">
            <WikiTree
              drawerOpen={drawerOpen}
              onCloseDrawer={() => setDrawerOpen(false)}
              onCreateDocument={(parentDocumentId) =>
                setCreateRequest({ parentDocumentId })
              }
              onDeleteItem={setDeleteTarget}
              onManageItem={setManageTarget}
              onSelectDocument={(nextDocumentId) =>
                void selectDocument(nextDocumentId)
              }
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
              {tree.documents.length === 0 ? (
                <WikiLanding />
              ) : (
                <DashboardLoading label="첫 위키 문서를 여는 중..." />
              )}
            </View>
          </View>
        </>
      )}

      {createRequest ? (
        <WikiCreateDialog
          key={createRequest.parentDocumentId ?? 'root'}
          onCreatedDocument={(createdDocumentId) =>
            void selectDocument(createdDocumentId)
          }
          onOpenChange={(open) => !open && setCreateRequest(null)}
          open
          organizationId={organizationId}
          parentDocumentId={createRequest.parentDocumentId}
        />
      ) : null}
      {manageTarget ? (
        <WikiManageDialog
          key={manageTarget.item.id}
          onOpenChange={(open) => !open && setManageTarget(null)}
          open
          organizationId={organizationId}
          target={manageTarget}
          tree={tree}
        />
      ) : null}
      {deleteTarget ? (
        <WikiDeleteDialog
          afterDelete={async () => {
            if (deleteTarget.item.id === documentId && afterDeleteRef.current) {
              await afterDeleteRef.current();
              return;
            }
            await clearLocalStore({
              organizationId,
              documentId: deleteTarget.item.id,
            });
          }}
          beforeDelete={
            deleteTarget.item.id === documentId
              ? async () => (await beforeNavigateRef.current?.()) ?? true
              : undefined
          }
          key={deleteTarget.item.id}
          onDeletedDocument={(deletedDocumentId) => {
            if (deletedDocumentId !== documentId) return;
            beforeNavigateRef.current = null;
            setDrawerOpen(false);
            router.replace('/wiki');
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

function WikiLanding() {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <View className="mb-4 size-12 items-center justify-center rounded-xl bg-muted">
        <Icon as={BookOpenText} className="size-6 text-muted-foreground" />
      </View>
      <Text className="text-base font-semibold">
        첫 위키 문서를 만들어 보세요
      </Text>
    </View>
  );
}
