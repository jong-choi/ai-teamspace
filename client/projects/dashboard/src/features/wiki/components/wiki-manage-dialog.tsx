import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { WikiTree } from '@repo/client/api-client/schemas';
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
  getWikiFolderDescendantIds,
  getWikiFolderPathLabel,
} from '@core/features/wiki/wiki-tree-model';

const rootFolderValue = '__wiki_root__';

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
  const [name, setName] = useState(
    target.kind === 'folder' ? target.item.name : target.item.title,
  );
  const [folderId, setFolderId] = useState<string | null>(
    target.kind === 'folder'
      ? target.item.parentFolderId
      : target.item.folderId,
  );
  const mutations = useWikiMutations(organizationId);
  const unavailableFolderIds = useMemo(() => {
    if (target.kind !== 'folder') return new Set<string>();
    const ids = getWikiFolderDescendantIds(tree, target.item.id);
    ids.add(target.item.id);
    return ids;
  }, [target, tree]);
  const folderOptions = tree.folders.filter(
    (folder) => !unavailableFolderIds.has(folder.id),
  );
  const selectedFolder = folderId
    ? tree.folders.find((folder) => folder.id === folderId)
    : null;
  const trimmedName = name.trim();

  const submit = async () => {
    if (!trimmedName || mutations.pending) return;
    try {
      if (target.kind === 'folder') {
        await mutations.updateFolder(target.item.id, {
          name: trimmedName,
          parentFolderId: folderId,
        });
      } else {
        await mutations.updateDocument(target.item.id, {
          title: trimmedName,
          folderId,
        });
      }
      onOpenChange(false);
    } catch {
      // mutation error notification은 공용 hook에서 처리한다.
    }
  };

  const label = target.kind === 'folder' ? '폴더' : '문서';
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !mutations.pending && onOpenChange(nextOpen)}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{label} 변경</DialogTitle>
          <DialogDescription>
            이름을 바꾸거나 다른 폴더로 이동합니다. 이름 충돌은 서버가 canonical
            suffix로 해결합니다.
          </DialogDescription>
        </DialogHeader>

        <View className="gap-4">
          <View className="gap-1.5">
            <Text className="text-xs font-medium">{label} 이름</Text>
            <Input
              editable={!mutations.pending}
              onChangeText={setName}
              value={name}
            />
          </View>
          <View className="gap-1.5">
            <Text className="text-xs font-medium">위치</Text>
            <Select
              disabled={mutations.pending}
              onValueChange={(option) => {
                if (!option) return;
                setFolderId(
                  option.value === rootFolderValue ? null : option.value,
                );
              }}
              value={{
                label: selectedFolder
                  ? getWikiFolderPathLabel(tree, selectedFolder.id)
                  : '위키 루트',
                value: selectedFolder?.id ?? rootFolderValue,
              }}
            >
              <SelectTrigger className="w-full" disabled={mutations.pending}>
                <SelectValue placeholder="위치 선택" />
              </SelectTrigger>
              <SelectContent className="max-h-64" side="bottom">
                <SelectItem label="위키 루트" value={rootFolderValue}>
                  위키 루트
                </SelectItem>
                {folderOptions.map((folder) => (
                  <SelectItem
                    key={folder.id}
                    label={getWikiFolderPathLabel(tree, folder.id)}
                    value={folder.id}
                  >
                    {getWikiFolderPathLabel(tree, folder.id)}
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
            disabled={!trimmedName || mutations.pending}
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
