import { Controller, useForm, type UseFormReturn } from 'react-hook-form';
import { View } from 'react-native';

import {
  getOrganizationsControllerGetActiveQueryKey,
  getOrganizationsControllerListQueryKey,
  useOrganizationsControllerCreate,
} from '@repo/client/api-client';
import { OrganizationsControllerCreateBody } from '@repo/client/api-client/schemas';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Label } from '@repo/client/rnr/components/ui/label';
import { Text } from '@repo/client/rnr/components/ui/text';

import { useQueryClient } from '@tanstack/react-query';

// 조직 생성 form 상태와 제출이다. 서버가 새 조직을 활성 조직으로 바꾸므로 성공하면 활성 조직과 목록을 다시 읽는다.
export function useOrganizationCreateForm({
  failureMessage,
  onCreated,
}: {
  failureMessage: string;
  onCreated: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<OrganizationsControllerCreateBody>({
    defaultValues: {
      name: '',
      slug: '',
    },
  });
  const mutation = useOrganizationsControllerCreate();
  const submit = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    const result = OrganizationsControllerCreateBody.safeParse({
      ...values,
      name: values.name.trim(),
      slug: values.slug.trim(),
    });

    if (!result.success) {
      form.setError('root', {
        message: result.error.issues[0]?.message ?? '입력값을 확인해 주세요.',
      });
      return;
    }

    try {
      await mutation.mutateAsync({ data: result.data });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getOrganizationsControllerGetActiveQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: getOrganizationsControllerListQueryKey(),
        }),
      ]);
      onCreated();
    } catch {
      form.setError('root', { message: failureMessage });
    }
  });

  return { form, pending: mutation.isPending, submit };
}

export function OrganizationCreateFields({
  autoFocus = false,
  form,
  onSubmit,
  pending,
}: {
  autoFocus?: boolean;
  form: UseFormReturn<OrganizationsControllerCreateBody>;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <View className="gap-4">
      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <View className="gap-1.5">
            <Label nativeID="organization-create-name">조직 이름</Label>
            <Input
              accessibilityLabel="조직 이름"
              aria-invalid={fieldState.invalid}
              autoFocus={autoFocus}
              className="shadow-none"
              editable={!pending}
              maxLength={255}
              onBlur={field.onBlur}
              onChangeText={(value) => {
                field.onChange(value);
                if (!form.formState.dirtyFields.slug) {
                  form.setValue('slug', toOrganizationSlug(value));
                }
              }}
              onSubmitEditing={onSubmit}
              placeholder="example"
              value={field.value}
            />
            {fieldState.error?.message ? (
              <Text className="text-xs text-destructive">
                {fieldState.error.message}
              </Text>
            ) : null}
          </View>
        )}
        rules={{ required: '조직 이름을 입력해 주세요.' }}
      />

      <Controller
        control={form.control}
        name="slug"
        render={({ field, fieldState }) => (
          <View className="gap-1.5">
            <Label nativeID="organization-create-slug">조직 주소</Label>
            <Input
              accessibilityLabel="조직 주소"
              aria-invalid={fieldState.invalid}
              autoCapitalize="none"
              className="shadow-none"
              editable={!pending}
              maxLength={255}
              onBlur={field.onBlur}
              onChangeText={(value) =>
                field.onChange(value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              }
              onSubmitEditing={onSubmit}
              placeholder="example-team"
              value={field.value}
            />
            <Text className="text-xs text-muted-foreground">
              영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.
            </Text>
            {fieldState.error?.message ? (
              <Text className="text-xs text-destructive">
                {fieldState.error.message}
              </Text>
            ) : null}
          </View>
        )}
        rules={{
          pattern: {
            message: '영문 소문자, 숫자, 하이픈으로 입력해 주세요.',
            value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
          },
          required: '조직 주소를 입력해 주세요.',
        }}
      />

      {form.formState.errors.root?.message ? (
        <Text className="text-xs leading-5 text-destructive">
          {form.formState.errors.root.message}
        </Text>
      ) : null}
    </View>
  );
}

function toOrganizationSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
