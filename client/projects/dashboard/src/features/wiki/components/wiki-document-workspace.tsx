import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { WikiTree as WikiTreeData } from '@repo/client/api-client/schemas';
import { cn } from '@repo/client/rnr/lib/utils';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import {
  WikiDocumentViewer,
  WikiMarkdownViewer,
} from '@core/features/wiki/components/wiki-document-viewer';
import { WikiHeader } from '@core/features/wiki/components/wiki-header';
import { WikiHistoryDialog } from '@core/features/wiki/components/wiki-history-dialog';
import { WikiMarkdownEditor } from '@core/features/wiki/components/wiki-markdown-editor';
import {
  WikiTree,
  type WikiTreeTarget,
} from '@core/features/wiki/components/wiki-tree';
import { useWikiEditSession } from '@core/features/wiki/use-wiki-edit-session';
import { createWikiMarkdownFileName } from '@core/features/wiki/wiki-export';
import { useWikiDocument } from '@core/features/wiki/wiki-query';

type BeforeNavigateHandler = () => Promise<boolean>;

type WikiDocumentWorkspaceProps = {
  documentId: string;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  onCreateDocument: (folderId: string | null) => void;
  onCreateFolder: (parentFolderId: string | null) => void;
  onDeleteItem: (target: WikiTreeTarget) => void;
  onManageItem: (target: WikiTreeTarget) => void;
  onNavigateConflictCopy: (documentId: string) => void;
  onNavigateDocument: (documentId: string) => void;
  onOpenTree: () => void;
  onOpenWikiRoot: () => void;
  onRegisterBeforeNavigate: (handler: BeforeNavigateHandler | null) => void;
  organizationId: string;
  tree: WikiTreeData;
};

export function WikiDocumentWorkspace({
  documentId,
  drawerOpen,
  onCloseDrawer,
  onCreateDocument,
  onCreateFolder,
  onDeleteItem,
  onManageItem,
  onNavigateConflictCopy,
  onNavigateDocument,
  onOpenTree,
  onOpenWikiRoot,
  onRegisterBeforeNavigate,
  organizationId,
  tree,
}: WikiDocumentWorkspaceProps) {
  const document = useWikiDocument(organizationId, documentId).data;
  const { exportMarkdown, notifyError, notifySuccess } = useDashboardPlatform();
  const [historyOpen, setHistoryOpen] = useState(false);
  const editSession = useWikiEditSession({
    document,
    organizationId,
    onConflictCopy: (conflictCopy) => onNavigateConflictCopy(conflictCopy.id),
  });

  useEffect(() => {
    onRegisterBeforeNavigate(
      editSession.mode === 'view' ? null : editSession.prepareToLeave,
    );
    return () => onRegisterBeforeNavigate(null);
  }, [editSession.mode, editSession.prepareToLeave, onRegisterBeforeNavigate]);

  const handleExport = async () => {
    const outcome = await editSession.saveNow();
    if (outcome === 'error' || outcome === 'conflict') {
      if (outcome === 'error') {
        notifyError({
          id: 'wiki-export-unsaved',
          title: '저장되지 않은 문서는 내보낼 수 없습니다',
          description: '저장 상태를 확인한 뒤 다시 시도해 주세요.',
        });
      }
      return;
    }

    try {
      const fileName = createWikiMarkdownFileName(document.title);
      await exportMarkdown({
        fileName,
        contentMarkdown: editSession.draft,
      });
      notifySuccess({
        id: 'wiki-export',
        title: 'Markdown을 내보냈습니다',
        description: fileName,
      });
    } catch {
      notifyError({
        id: 'wiki-export-error',
        title: 'Markdown을 내보내지 못했습니다',
        description: '파일 또는 공유 기능을 사용할 수 있는지 확인해 주세요.',
      });
    }
  };

  return (
    <View className="relative min-h-0 flex-1 overflow-hidden bg-background">
      <WikiHeader
        activeDocument={tree.documents.find((item) => item.id === documentId)}
        mode={editSession.mode}
        modeChangePending={editSession.modeChangePending}
        onExport={() => void handleExport()}
        onModeChange={(mode) => void editSession.requestMode(mode)}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenTree={onOpenTree}
        onOpenWikiRoot={onOpenWikiRoot}
        saveIndicator={editSession.saveIndicator}
        tree={tree}
      />

      <View className="relative min-h-0 flex-1 flex-row overflow-hidden">
        <WikiTree
          activeDocumentId={documentId}
          drawerOpen={drawerOpen}
          onCloseDrawer={onCloseDrawer}
          onCreateDocument={onCreateDocument}
          onCreateFolder={onCreateFolder}
          onDeleteItem={onDeleteItem}
          onManageItem={onManageItem}
          onSelectDocument={onNavigateDocument}
          tree={tree}
        />

        <Pressable
          accessibilityLabel="위키 탐색기 닫기"
          className={cn(
            'absolute inset-0 z-20 bg-zinc-950/50 md:hidden',
            drawerOpen ? 'flex' : 'hidden',
          )}
          onPress={onCloseDrawer}
        />

        <View className="min-h-0 min-w-0 flex-1 bg-background">
          {editSession.mode === 'view' ? (
            <WikiDocumentViewer document={document} />
          ) : editSession.mode === 'edit' ? (
            <WikiMarkdownEditor
              editable={editSession.lockOwned}
              onChangeText={editSession.setDraft}
              value={editSession.draft}
            />
          ) : (
            <View className="min-h-0 flex-1 md:flex-row">
              <View className="min-h-0 flex-1">
                <WikiMarkdownEditor
                  compact
                  editable={editSession.lockOwned}
                  onChangeText={editSession.setDraft}
                  value={editSession.draft}
                />
              </View>
              <View className="min-h-0 flex-1 border-t border-border md:border-l md:border-t-0">
                <WikiMarkdownViewer
                  compact
                  contentMarkdown={editSession.draft}
                />
              </View>
            </View>
          )}
        </View>
      </View>

      <WikiHistoryDialog
        documentId={documentId}
        onOpenChange={setHistoryOpen}
        open={historyOpen}
        organizationId={organizationId}
      />
    </View>
  );
}
