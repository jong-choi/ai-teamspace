import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type {
  WikiDocumentTreeNode,
  WikiTreeOutput as WikiTreeData,
} from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/client/rnr/components/ui/dropdown-menu';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { getWikiExpandedAncestorIds } from '@core/features/wiki/wiki-tree-model';

import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';

export type WikiTreeTarget = {
  kind: 'document';
  item: WikiDocumentTreeNode;
};

type WikiTreeProps = {
  activeDocumentId?: string;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  onCreateDocument: (parentDocumentId: string | null) => void;
  onDeleteItem: (target: WikiTreeTarget) => void;
  onManageItem: (target: WikiTreeTarget) => void;
  onSelectDocument: (documentId: string) => void;
  tree: WikiTreeData;
};

export function WikiTree({
  activeDocumentId,
  drawerOpen,
  onCloseDrawer,
  onCreateDocument,
  onDeleteItem,
  onManageItem,
  onSelectDocument,
  tree,
}: WikiTreeProps) {
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(
    () => new Set(getWikiExpandedAncestorIds(tree, activeDocumentId)),
  );
  const activeAncestorKey = getWikiExpandedAncestorIds(
    tree,
    activeDocumentId,
  ).join(':');

  useEffect(() => {
    if (!activeAncestorKey) return;
    const ancestorIds = activeAncestorKey.split(':');
    setExpandedDocuments((current) => {
      const next = new Set(current);
      for (const documentId of ancestorIds) next.add(documentId);
      return next;
    });
  }, [activeAncestorKey]);

  const isExpanded = (documentId: string) => expandedDocuments.has(documentId);
  const toggleDocument = (documentId: string) => {
    setExpandedDocuments((current) => {
      const next = new Set(current);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  };

  const content = (
    <TreeSurface
      activeDocumentId={activeDocumentId}
      isExpanded={isExpanded}
      onCloseDrawer={onCloseDrawer}
      onCreateDocument={onCreateDocument}
      onDeleteItem={onDeleteItem}
      onManageItem={onManageItem}
      onSelectDocument={onSelectDocument}
      onToggleDocument={toggleDocument}
      tree={tree}
    />
  );

  return (
    <>
      <View className="hidden w-56 shrink-0 border-r border-border bg-muted/30 md:flex">
        {content}
      </View>
      <View
        className={cn(
          'absolute inset-y-0 left-0 z-30 w-72 border-r border-border bg-background shadow-xl md:hidden',
          drawerOpen ? 'flex' : 'hidden',
        )}
      >
        {content}
      </View>
    </>
  );
}

type TreeSurfaceProps = Omit<WikiTreeProps, 'drawerOpen'> & {
  isExpanded: (documentId: string) => boolean;
  onToggleDocument: (documentId: string) => void;
};

function TreeSurface({
  activeDocumentId,
  isExpanded,
  onCloseDrawer,
  onCreateDocument,
  onDeleteItem,
  onManageItem,
  onSelectDocument,
  onToggleDocument,
  tree,
}: TreeSurfaceProps) {
  return (
    <View className="min-h-0 flex-1">
      <View className="h-11 shrink-0 flex-row items-center justify-between border-b border-border px-3">
        <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          위키 탐색기
        </Text>
        <View className="flex-row items-center gap-0.5">
          <Button
            accessibilityLabel="새 문서"
            className="h-7 w-7"
            onPress={() => onCreateDocument(null)}
            size="icon"
            variant="ghost"
          >
            <Icon as={FilePlus2} className="size-3.5 text-muted-foreground" />
          </Button>
          <Button
            accessibilityLabel="위키 탐색기 닫기"
            className="ml-1 h-7 w-7 md:hidden"
            onPress={onCloseDrawer}
            size="icon"
            variant="ghost"
          >
            <Icon as={X} className="size-4 text-muted-foreground" />
          </Button>
        </View>
      </View>

      <ScrollView
        className="min-h-0 flex-1"
        contentContainerClassName="p-2 pb-6"
        showsVerticalScrollIndicator={false}
      >
        {tree.documents.length === 0 ? (
          <View className="items-center px-3 py-8">
            <Text className="text-center text-xs leading-5 text-muted-foreground">
              아직 위키 문서가 없습니다. 새 문서를 만들어 시작하세요.
            </Text>
          </View>
        ) : (
          <WikiDocumentBranch
            activeDocumentId={activeDocumentId}
            depth={0}
            documents={tree.documents}
            isExpanded={isExpanded}
            onCreateDocument={onCreateDocument}
            onDeleteItem={onDeleteItem}
            onManageItem={onManageItem}
            onSelectDocument={onSelectDocument}
            onToggleDocument={onToggleDocument}
          />
        )}
      </ScrollView>
    </View>
  );
}

type WikiDocumentBranchProps = {
  activeDocumentId?: string;
  depth: number;
  documents: readonly WikiDocumentTreeNode[];
  isExpanded: (documentId: string) => boolean;
  onCreateDocument: (parentDocumentId: string | null) => void;
  onDeleteItem: (target: WikiTreeTarget) => void;
  onManageItem: (target: WikiTreeTarget) => void;
  onSelectDocument: (documentId: string) => void;
  onToggleDocument: (documentId: string) => void;
};

function WikiDocumentBranch({
  activeDocumentId,
  depth,
  documents,
  isExpanded,
  onCreateDocument,
  onDeleteItem,
  onManageItem,
  onSelectDocument,
  onToggleDocument,
}: WikiDocumentBranchProps) {
  const sortedDocuments = [...documents].sort(compareDocuments);
  return (
    <View className="gap-0.5">
      {sortedDocuments.map((document) => {
        const hasChildren = document.children.length > 0;
        const expanded = hasChildren && isExpanded(document.id);
        return (
          <View key={document.id}>
            <TreeDocumentRow
              active={document.id === activeDocumentId}
              depth={depth}
              document={document}
              expanded={expanded}
              hasChildren={hasChildren}
              onCreateDocument={onCreateDocument}
              onDeleteItem={onDeleteItem}
              onManageItem={onManageItem}
              onSelectDocument={onSelectDocument}
              onToggleDocument={onToggleDocument}
            />
            {expanded ? (
              <WikiDocumentBranch
                activeDocumentId={activeDocumentId}
                depth={depth + 1}
                documents={document.children}
                isExpanded={isExpanded}
                onCreateDocument={onCreateDocument}
                onDeleteItem={onDeleteItem}
                onManageItem={onManageItem}
                onSelectDocument={onSelectDocument}
                onToggleDocument={onToggleDocument}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function TreeDocumentRow({
  active,
  depth,
  document,
  expanded,
  hasChildren,
  onCreateDocument,
  onDeleteItem,
  onManageItem,
  onSelectDocument,
  onToggleDocument,
}: {
  active: boolean;
  depth: number;
  document: WikiDocumentTreeNode;
  expanded: boolean;
  hasChildren: boolean;
  onCreateDocument: (parentDocumentId: string | null) => void;
  onDeleteItem: (target: WikiTreeTarget) => void;
  onManageItem: (target: WikiTreeTarget) => void;
  onSelectDocument: (documentId: string) => void;
  onToggleDocument: (documentId: string) => void;
}) {
  const target: WikiTreeTarget = { kind: 'document', item: document };
  return (
    <View
      className={cn(
        'group flex-row items-center rounded-md pr-0.5',
        active ? 'bg-accent' : 'web:hover:bg-accent/60',
      )}
      style={{ paddingLeft: Math.min(depth, 6) * 12 }}
    >
      {hasChildren ? (
        <Pressable
          accessibilityLabel={`${document.title} 하위 문서 ${expanded ? '접기' : '펼치기'}`}
          className="size-6 shrink-0 items-center justify-center"
          hitSlop={4}
          onPress={() => onToggleDocument(document.id)}
        >
          <Icon
            as={expanded ? ChevronDown : ChevronRight}
            className="size-3.5 text-muted-foreground"
          />
        </Pressable>
      ) : (
        <View className="size-6 shrink-0" />
      )}
      <Pressable
        accessibilityLabel={`${document.title} 문서 열기`}
        className="min-w-0 flex-1 flex-row items-center gap-1.5 px-1 py-1"
        onPress={() => onSelectDocument(document.id)}
      >
        <Icon
          as={FileText}
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground',
            active && 'text-foreground',
          )}
        />
        <Text
          className={cn(
            'min-w-0 flex-1 truncate text-xs text-muted-foreground',
            active && 'font-semibold text-foreground',
          )}
        >
          {document.title}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel={`${document.title}에 하위 문서 만들기`}
        className="size-6 items-center justify-center rounded web:opacity-0 web:group-hover:opacity-100"
        hitSlop={6}
        onPress={() => onCreateDocument(document.id)}
      >
        <Icon as={Plus} className="size-3 text-muted-foreground" />
      </Pressable>
      <ItemActions
        onCreateDocument={() => onCreateDocument(document.id)}
        onDelete={() => onDeleteItem(target)}
        onManage={() => onManageItem(target)}
      />
    </View>
  );
}

function ItemActions({
  onCreateDocument,
  onDelete,
  onManage,
}: {
  onCreateDocument: () => void;
  onDelete: () => void;
  onManage: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Pressable
          accessibilityLabel="문서 메뉴 열기"
          className="size-6 items-center justify-center rounded web:opacity-0 web:group-hover:opacity-100"
          hitSlop={6}
        >
          <Icon
            as={MoreHorizontal}
            className="size-3.5 text-muted-foreground"
          />
        </Pressable>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onPress={onCreateDocument}>
          <Icon as={FilePlus2} className="mr-2 size-4 text-muted-foreground" />
          <Text>하위 문서 추가</Text>
        </DropdownMenuItem>
        <DropdownMenuItem onPress={onManage}>
          <Icon as={Pencil} className="mr-2 size-4 text-muted-foreground" />
          <Text>이름 / 위치 변경</Text>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onPress={onDelete}>
          <Icon as={Trash2} className="mr-2 size-4 text-destructive" />
          <Text className="text-destructive">삭제</Text>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function compareDocuments(
  left: WikiDocumentTreeNode,
  right: WikiDocumentTreeNode,
): number {
  if (left.position !== right.position) return left.position - right.position;
  const byTitle = left.title.localeCompare(right.title, 'ko');
  return byTitle === 0 ? left.id.localeCompare(right.id) : byTitle;
}
