import { ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  OrganizationCreateFields,
  useOrganizationCreateForm,
} from '@core/features/organizations/organization-create-form';

// 열릴 때마다 새로 mount해서 쓰는 조직 생성 dialog다. 만든 조직이 활성 조직이 되므로 홈으로 이동한다.
export function CreateOrganizationDialog({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { form, pending, submit } = useOrganizationCreateForm({
    failureMessage: '조직을 만들지 못했습니다. 이름과 주소를 확인해 주세요.',
    onCreated: () => {
      onOpenChange(false);
      router.replace('/');
    },
  });

  const close = () => {
    if (pending) return;
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={(nextOpen) => !nextOpen && close()} open>
      {/* Web의 Radix 래퍼가 폭을 갖지 않아 max-w-xl 폭을 직접 준다. */}
      <DialogContent className="sm:max-w-xl web:w-[min(36rem,calc(100vw-2rem))]">
        {/* 보이는 제목은 두지 않고 스크린리더용 이름만 남긴다. */}
        <DialogTitle className="sr-only">새 조직</DialogTitle>
        <OrganizationCreateFields
          autoFocus
          form={form}
          onSubmit={() => void submit()}
          pending={pending}
        />
        <DialogFooter>
          <Button disabled={pending} onPress={close} variant="outline">
            <Text>취소</Text>
          </Button>
          <Button disabled={pending} onPress={() => void submit()}>
            {pending ? (
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
