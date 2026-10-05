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
  onCreatedDocument: (documentId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  parentDocumentId: string | null;
};

export function WikiCreateDialog({
  onCreatedDocument,
  onOpenChange,
  open,
  organizationId,
  parentDocumentId,
}: WikiCreateDialogProps) {
  const [title, setTitle] = useState('');
  const mutations = useWikiMutations(organizationId);
  const trimmedTitle = title.trim();

  const close = () => {
    if (mutations.pending) return;
    setTitle('');
    onOpenChange(false);
  };

  const submit = async () => {
    if (!trimmedTitle || mutations.pending) return;
    try {
      const document = await mutations.createDocument({
        title: trimmedTitle,
        parentDocumentId,
        contentMarkdown: '',
      });
      setTitle('');
      onOpenChange(false);
      onCreatedDocument(document.id);
    } catch {
      // mutation error notification은 공용 hook에서 처리한다.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>새 문서</DialogTitle>
          <DialogDescription>
            {parentDocumentId
              ? '선택한 문서 아래에 새 하위 문서를 만듭니다.'
              : '위키 루트에 새 문서를 만듭니다.'}
          </DialogDescription>
        </DialogHeader>
        <View className="gap-1.5">
          <Text className="text-xs font-medium">문서 이름</Text>
          <Input
            autoFocus
            editable={!mutations.pending}
            onChangeText={setTitle}
            onSubmitEditing={() => void submit()}
            placeholder="예: API 설계"
            value={title}
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
            disabled={!trimmedTitle || mutations.pending}
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
