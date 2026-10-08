import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { WikiTreeOutput as WikiTreeData } from '@repo/client/api-client/schemas';
import { cn } from '@repo/client/rnr/lib/utils';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { WikiKnowledgeGraphActions } from '@core/features/knowledge-graph/components/wiki/wiki-knowledge-graph-actions';
import { WikiMarkdownViewer } from '@core/features/wiki/components/wiki-document-viewer';
import { WikiHeader } from '@core/features/wiki/components/wiki-header';
import { WikiHistoryDialog } from '@core/features/wiki/components/wiki-history-dialog';
import { WikiMarkdownEditor } from '@core/features/wiki/components/wiki-markdown-editor';
import {
  WikiTree,
  type WikiTreeTarget,
} from '@core/features/wiki/components/wiki-tree';
import { useWikiCollaborationSession } from '@core/features/wiki/use-wiki-collaboration-session';
import { createWikiMarkdownFileName } from '@core/features/wiki/wiki-export';
import { useWikiDocument } from '@core/features/wiki/wiki-query';
import { findWikiDocumentNode } from '@core/features/wiki/wiki-tree-model';

type BeforeNavigateHandler = () => Promise<boolean>;
type AfterDeleteHandler = () => Promise<void>;

type WikiDocumentWorkspaceProps = {
  documentId: string;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  onCreateDocument: (parentDocumentId: string | null) => void;
  onDeleteItem: (target: WikiTreeTarget) => void;
  onManageItem: (target: WikiTreeTarget) => void;
  onNavigateDocument: (documentId: string) => void;
  onOpenTree: () => void;
  onOpenWikiRoot: () => void;
  onRegisterAfterDelete: (handler: AfterDeleteHandler | null) => void;
  onRegisterBeforeNavigate: (handler: BeforeNavigateHandler | null) => void;
  organizationId: string;
  tree: WikiTreeData;
};

export function WikiDocumentWorkspace({
  documentId,
  drawerOpen,
  onCloseDrawer,
  onCreateDocument,
  onDeleteItem,
  onManageItem,
  onNavigateDocument,
  onOpenTree,
  onOpenWikiRoot,
  onRegisterAfterDelete,
  onRegisterBeforeNavigate,
  organizationId,
  tree,
}: WikiDocumentWorkspaceProps) {
  const document = useWikiDocument(organizationId, documentId).data;
  const activeDocument = findWikiDocumentNode(tree, documentId) ?? undefined;
  const { exportMarkdown, notifyError, notifySuccess } = useDashboardPlatform();
  const [historyOpen, setHistoryOpen] = useState(false);
  const collaboration = useWikiCollaborationSession({
    documentId,
    organizationId,
  });

  useEffect(() => {
    onRegisterBeforeNavigate(collaboration.prepareToLeave);
    return () => onRegisterBeforeNavigate(null);
  }, [collaboration.prepareToLeave, onRegisterBeforeNavigate]);

  useEffect(() => {
    onRegisterAfterDelete(collaboration.clearLocalState);
    return () => onRegisterAfterDelete(null);
  }, [collaboration.clearLocalState, onRegisterAfterDelete]);

  const handleExport = async () => {
    try {
      const fileName = createWikiMarkdownFileName(document.title);
      await exportMarkdown({
        fileName,
        contentMarkdown: collaboration.exportMarkdown(document.contentMarkdown),
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
        activeDocument={activeDocument}
        collaborators={collaboration.collaborators}
        editModeDisabled={collaboration.editModeDisabled}
        knowledgeGraphActions={
          activeDocument ? (
            <WikiKnowledgeGraphActions
              documentId={documentId}
              organizationId={organizationId}
              savedOnServer={collaboration.indicator.tone === 'saved'}
            />
          ) : undefined
        }
        mode={collaboration.mode}
        onExport={() => void handleExport()}
        onModeChange={collaboration.requestMode}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenTree={onOpenTree}
        onOpenWikiRoot={onOpenWikiRoot}
        saveIndicator={collaboration.indicator}
        tree={tree}
      />

      <View className="relative min-h-0 flex-1 flex-row overflow-hidden">
        <WikiTree
          activeDocumentId={documentId}
          drawerOpen={drawerOpen}
          onCloseDrawer={onCloseDrawer}
          onCreateDocument={onCreateDocument}
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
          {collaboration.mode === 'view' ? (
            <WikiMarkdownViewer
              contentMarkdown={
                collaboration.hasUsableState
                  ? collaboration.liveMarkdown
                  : document.contentMarkdown
              }
            />
          ) : collaboration.mode === 'edit' ? (
            <WikiMarkdownEditor
              collaborators={collaboration.collaborators}
              editable={collaboration.editable}
              onChangeText={collaboration.setMarkdown}
              onCompositionEnd={collaboration.endComposition}
              onCompositionStart={collaboration.beginComposition}
              onSelectionChange={collaboration.updateSelection}
              value={collaboration.editorMarkdown}
            />
          ) : (
            <View className="min-h-0 flex-1 md:flex-row">
              <View className="min-h-0 flex-1">
                <WikiMarkdownEditor
                  collaborators={collaboration.collaborators}
                  compact
                  editable={collaboration.editable}
                  onChangeText={collaboration.setMarkdown}
                  onCompositionEnd={collaboration.endComposition}
                  onCompositionStart={collaboration.beginComposition}
                  onSelectionChange={collaboration.updateSelection}
                  value={collaboration.editorMarkdown}
                />
              </View>
              <View className="min-h-0 flex-1 border-t border-border md:border-l md:border-t-0">
                <WikiMarkdownViewer
                  compact
                  contentMarkdown={collaboration.liveMarkdown}
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
