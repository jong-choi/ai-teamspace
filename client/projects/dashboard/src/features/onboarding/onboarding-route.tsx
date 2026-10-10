import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { useOrganizationsControllerGetActiveSuspense } from '@repo/client/api-client';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import {
  OrganizationCreateFields,
  useOrganizationCreateForm,
} from '@core/features/organizations/organization-create-form';

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
  const { form, pending, submit } = useOrganizationCreateForm({
    failureMessage:
      '업무 공간을 만들지 못했습니다. 이름과 주소를 확인해 주세요.',
    onCreated: () => router.replace('/'),
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
          <OrganizationCreateFields
            form={form}
            onSubmit={() => void submit()}
            pending={pending}
          />

          <Button
            className="shadow-none"
            disabled={pending}
            onPress={() => void submit()}
          >
            {pending ? <ActivityIndicator color="white" size="small" /> : null}
            <Text>업무 공간 만들기</Text>
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}
