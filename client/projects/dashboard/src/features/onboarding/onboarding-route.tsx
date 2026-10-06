import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import {
  getOrganizationsControllerGetActiveQueryKey,
  useOrganizationsControllerCreate,
  useOrganizationsControllerGetActiveSuspense,
} from '@repo/client/api-client';
import { OrganizationsControllerCreateBody } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Label } from '@repo/client/rnr/components/ui/label';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';

import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';

export function OnboardingRoute() {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  if (sessionPending) {
    return <DashboardLoading label="세션을 확인하는 중..." />;
  }
  if (!currentUserId) {
    return <Redirect href="/login" />;
  }

  return (
    <DashboardQueryBoundary
      fallback={<DashboardLoading label="업무 공간을 확인하는 중..." />}
      resetKeys={[currentUserId]}
      title="온보딩 정보를 불러오지 못했습니다"
    >
      <AuthenticatedOnboardingRoute />
    </DashboardQueryBoundary>
  );
}

function AuthenticatedOnboardingRoute() {
  const activeOrganization = useOrganizationsControllerGetActiveSuspense({
    query: {
      select: (response) => response.activeOrganization,
    },
  }).data;

  if (activeOrganization) {
    return <Redirect href="/" />;
  }

  return <OrganizationOnboardingForm />;
}

function OrganizationOnboardingForm() {
  const router = useRouter();
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
      await queryClient.invalidateQueries({
        queryKey: getOrganizationsControllerGetActiveQueryKey(),
      });
      router.replace('/');
    } catch {
      form.setError('root', {
        message: '업무 공간을 만들지 못했습니다. 이름과 주소를 확인해 주세요.',
      });
    }
  });

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="min-h-full items-center justify-center px-4 py-12"
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full max-w-xl gap-7 rounded-xl border border-border bg-background p-6 sm:p-8">
        <View className="gap-3">
          <View className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <View className="h-full w-full rounded-full bg-primary" />
          </View>
          <Text className="text-xs font-medium text-muted-foreground">
            시작하기 · 1/1
          </Text>
          <Text className="text-2xl font-semibold tracking-tight">
            첫 업무 공간을 만들어볼까요?
          </Text>
          <Text className="text-sm leading-6 text-muted-foreground">
            팀과 프로젝트, 위키, 회의일정을 함께 관리할 조직을 설정합니다.
          </Text>
        </View>

        <View className="gap-4">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <View className="gap-1.5">
                <Label nativeID="onboarding-name">조직 이름</Label>
                <Input
                  accessibilityLabel="조직 이름"
                  aria-invalid={fieldState.invalid}
                  className="shadow-none"
                  editable={!mutation.isPending}
                  maxLength={255}
                  onBlur={field.onBlur}
                  onChangeText={(value) => {
                    field.onChange(value);
                    if (!form.formState.dirtyFields.slug) {
                      form.setValue('slug', toOrganizationSlug(value));
                    }
                  }}
                  placeholder="Acme 팀"
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
                <Label nativeID="onboarding-slug">조직 주소</Label>
                <Input
                  accessibilityLabel="조직 주소"
                  aria-invalid={fieldState.invalid}
                  autoCapitalize="none"
                  className="shadow-none"
                  editable={!mutation.isPending}
                  maxLength={255}
                  onBlur={field.onBlur}
                  onChangeText={(value) =>
                    field.onChange(toOrganizationSlug(value))
                  }
                  placeholder="acme-team"
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

          <Button
            className="shadow-none"
            disabled={mutation.isPending}
            onPress={() => void submit()}
          >
            {mutation.isPending ? (
              <ActivityIndicator color="white" size="small" />
            ) : null}
            <Text>업무 공간 만들기</Text>
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}

function toOrganizationSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
