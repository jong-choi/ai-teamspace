import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

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
import { Text } from '@repo/client/rnr/components/ui/text';
import { useWikiMutations } from '@core/features/wiki/use-wiki-mutations';

type WikiCreateDialogProps = {
  kind: 'folder' | 'document';
  onCreatedDocument: (documentId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  parentFolderId: string | null;
};

export function WikiCreateDialog({
  kind,
  onCreatedDocument,
  onOpenChange,
  open,
  organizationId,
  parentFolderId,
}: WikiCreateDialogProps) {
  const [name, setName] = useState('');
  const mutations = useWikiMutations(organizationId);
  const trimmedName = name.trim();

  const close = () => {
    if (mutations.pending) return;
    setName('');
    onOpenChange(false);
  };

  const submit = async () => {
    if (!trimmedName || mutations.pending) return;
    try {
      if (kind === 'folder') {
        await mutations.createFolder({
          name: trimmedName,
          parentFolderId,
        });
        setName('');
        onOpenChange(false);
        return;
      }

      const document = await mutations.createDocument({
        title: trimmedName,
        folderId: parentFolderId,
        contentMarkdown: '',
      });
      setName('');
      onOpenChange(false);
      onCreatedDocument(document.id);
    } catch {
      // mutation error notification은 공용 hook에서 처리한다.
    }
  };

  const label = kind === 'folder' ? '폴더' : '문서';
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>새 {label}</DialogTitle>
          <DialogDescription>
            {parentFolderId
              ? `선택한 폴더 아래에 새 ${label}를 만듭니다.`
              : `위키 루트에 새 ${label}를 만듭니다.`}
          </DialogDescription>
        </DialogHeader>
        <View className="gap-1.5">
          <Text className="text-xs font-medium">{label} 이름</Text>
          <Input
            autoFocus
            editable={!mutations.pending}
            onChangeText={setName}
            onSubmitEditing={() => void submit()}
            placeholder={kind === 'folder' ? '예: 제품' : '예: API 설계'}
            value={name}
          />
          <Text className="text-[10px] leading-4 text-muted-foreground">
            같은 위치에 동일한 이름이 있으면 서버가 (01), (02) suffix를
            붙입니다.
          </Text>
        </View>
        <DialogFooter>
          <Button
            disabled={mutations.pending}
            onPress={close}
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
              <Text className="text-primary-foreground">만들기</Text>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
