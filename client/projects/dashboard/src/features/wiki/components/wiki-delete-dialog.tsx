import { ActivityIndicator } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Text } from '@repo/client/rnr/components/ui/text';
import type { WikiTreeTarget } from '@core/features/wiki/components/wiki-tree';
import { useWikiMutations } from '@core/features/wiki/use-wiki-mutations';

type WikiDeleteDialogProps = {
  beforeDelete?: () => Promise<boolean>;
  onDeletedDocument: (documentId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  target: WikiTreeTarget;
};

export function WikiDeleteDialog({
  beforeDelete,
  onDeletedDocument,
  onOpenChange,
  open,
  organizationId,
  target,
}: WikiDeleteDialogProps) {
  const mutations = useWikiMutations(organizationId);
  const label = target.kind === 'folder' ? target.item.name : target.item.title;

  const submit = async () => {
    if (mutations.pending) return;
    if (beforeDelete && !(await beforeDelete())) return;
    try {
      if (target.kind === 'folder') {
        await mutations.deleteFolder(target.item.id);
      } else {
        await mutations.deleteDocument(target.item.id);
        onDeletedDocument(target.item.id);
      }
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
          <DialogTitle>
            {target.kind === 'folder' ? '폴더' : '문서'} 삭제
          </DialogTitle>
          <DialogDescription>
            “{label}”을 삭제합니다.
            {target.kind === 'folder'
              ? ' 하위 항목이 있는 폴더는 서버가 삭제를 거부합니다.'
              : ' 삭제한 문서는 복구할 수 없습니다.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            disabled={mutations.pending}
            onPress={() => onOpenChange(false)}
            variant="outline"
          >
            <Text>취소</Text>
          </Button>
          <Button
            disabled={mutations.pending}
            onPress={() => void submit()}
            variant="destructive"
          >
            {mutations.pending ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text className="text-destructive-foreground">삭제</Text>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
