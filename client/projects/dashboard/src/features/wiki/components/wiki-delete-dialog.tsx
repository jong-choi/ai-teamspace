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
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import type { WikiTreeTarget } from '@core/features/wiki/components/wiki-tree';
import { useWikiMutations } from '@core/features/wiki/use-wiki-mutations';

type WikiDeleteDialogProps = {
  afterDelete?: () => Promise<void>;
  beforeDelete?: () => Promise<boolean>;
  onDeletedDocument: (documentId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  target: WikiTreeTarget;
};

export function WikiDeleteDialog({
  afterDelete,
  beforeDelete,
  onDeletedDocument,
  onOpenChange,
  open,
  organizationId,
  target,
}: WikiDeleteDialogProps) {
  const mutations = useWikiMutations(organizationId);
  const { notifyError } = useDashboardPlatform();

  const submit = async () => {
    if (mutations.pending) return;
    if (beforeDelete && !(await beforeDelete())) return;
    try {
      await mutations.deleteDocument(target.item.id);
      try {
        await afterDelete?.();
      } catch {
        notifyError({
          id: 'wiki-local-delete-cleanup',
          title: '삭제한 문서의 로컬 초안을 정리하지 못했습니다',
          description: '앱을 다시 열면 로컬 저장소 정리를 다시 시도해 주세요.',
        });
      }
      onDeletedDocument(target.item.id);
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
          <DialogTitle>문서 삭제</DialogTitle>
          <DialogDescription>
            “{target.item.title}”을 삭제합니다.
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
