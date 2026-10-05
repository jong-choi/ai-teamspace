import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { WikiTreeOutput as WikiTree } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Input } from '@repo/client/rnr/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import { Text } from '@repo/client/rnr/components/ui/text';
import type { WikiTreeTarget } from '@core/features/wiki/components/wiki-tree';
import { useWikiMutations } from '@core/features/wiki/use-wiki-mutations';
import {
  findWikiDocumentNode,
  flattenWikiDocuments,
  getWikiDocumentDescendantIds,
  getWikiDocumentPathLabel,
} from '@core/features/wiki/wiki-tree-model';

const rootDocumentValue = '__wiki_root__';

type WikiManageDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  target: WikiTreeTarget;
  tree: WikiTree;
};

export function WikiManageDialog({
  onOpenChange,
  open,
  organizationId,
  target,
  tree,
}: WikiManageDialogProps) {
  const [title, setTitle] = useState(target.item.title);
  const [parentDocumentId, setParentDocumentId] = useState<string | null>(
    target.item.parentDocumentId,
  );
  const mutations = useWikiMutations(organizationId);
  const unavailableDocumentIds = useMemo(() => {
    const ids = getWikiDocumentDescendantIds(tree, target.item.id);
    ids.add(target.item.id);
    return ids;
  }, [target.item.id, tree]);
  const parentOptions = flattenWikiDocuments(tree).filter(
    (document) => !unavailableDocumentIds.has(document.id),
  );
  const selectedParent = parentDocumentId
    ? findWikiDocumentNode(tree, parentDocumentId)
    : null;
  const trimmedTitle = title.trim();

  const submit = async () => {
    if (!trimmedTitle || mutations.pending) return;
    try {
      await mutations.updateDocument(target.item.id, {
        title: trimmedTitle,
        parentDocumentId,
      });
      onOpenChange(false);
    } catch {
      // mutation error notification은 공용 hook에서 처리한다.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !mutations.pending && onOpenChange(nextOpen)}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>문서 변경</DialogTitle>
          <DialogDescription>
            이름을 바꾸거나 다른 문서 아래로 이동합니다. 이름 충돌은 서버가
            canonical suffix로 해결합니다.
          </DialogDescription>
        </DialogHeader>

        <View className="gap-4">
          <View className="gap-1.5">
            <Text className="text-xs font-medium">문서 이름</Text>
            <Input
              editable={!mutations.pending}
              onChangeText={setTitle}
              value={title}
            />
          </View>
          <View className="gap-1.5">
            <Text className="text-xs font-medium">위치</Text>
            <Select
              disabled={mutations.pending}
              onValueChange={(option) => {
                if (!option) return;
                setParentDocumentId(
                  option.value === rootDocumentValue ? null : option.value,
                );
              }}
              value={{
                label: selectedParent
                  ? getWikiDocumentPathLabel(tree, selectedParent.id)
                  : '위키 루트',
                value: selectedParent?.id ?? rootDocumentValue,
              }}
            >
              <SelectTrigger className="w-full" disabled={mutations.pending}>
                <SelectValue placeholder="위치 선택" />
              </SelectTrigger>
              <SelectContent className="max-h-64" side="bottom">
                <SelectItem label="위키 루트" value={rootDocumentValue}>
                  위키 루트
                </SelectItem>
                {parentOptions.map((document) => (
                  <SelectItem
                    key={document.id}
                    label={getWikiDocumentPathLabel(tree, document.id)}
                    value={document.id}
                  >
                    {getWikiDocumentPathLabel(tree, document.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </View>
        </View>

        <DialogFooter>
          <Button
            disabled={mutations.pending}
            onPress={() => onOpenChange(false)}
            variant="outline"
          >
            <Text>취소</Text>
          </Button>
          <Button
            disabled={!trimmedTitle || mutations.pending}
            onPress={() => void submit()}
          >
            {mutations.pending ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text className="text-primary-foreground">변경</Text>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
