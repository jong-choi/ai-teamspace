import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import { CreateProjectDialog } from '@core/features/projects/components/create-project-dialog';
import { ProjectOverviewCard } from '@core/features/projects/components/project-overview-card';
import { ProjectViewSwitcher } from '@core/features/projects/components/project-view-switcher';
import {
  useProjectMembers,
  useProjects,
} from '@core/features/projects/projects-query';
import { ProjectsRouteFrame } from '@core/features/projects/projects-route-frame';

import { Plus } from 'lucide-react-native';

export function ProjectsRoute() {
  return (
    <ProjectsRouteFrame>
      {(organizationId) => <ProjectsOverview organizationId={organizationId} />}
    </ProjectsRouteFrame>
  );
}

function ProjectsOverview({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  const openProject = (projectId: string, view: 'board' | 'list') => {
    router.push({
      pathname: '/projects/[projectId]',
      params: { projectId, view },
    });
  };

  return (
    <View className="min-h-0 flex-1 bg-background">
      <View className="shrink-0 flex-row items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-6">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-xs text-muted-foreground">프로젝트</Text>
            <Text className="text-xs text-muted-foreground">/</Text>
            <Text className="text-xs font-semibold">전체 프로젝트</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <DashboardQueryBoundary
            fallback={
              <ProjectViewSwitcher
                activeView="overview"
                disabledViews={['board', 'list']}
                onSelectView={() => undefined}
              />
            }
            resetKeys={[organizationId]}
            title="프로젝트 보기를 불러오지 못했습니다"
          >
            <OverviewViewSwitcher
              organizationId={organizationId}
              openProject={openProject}
            />
          </DashboardQueryBoundary>
          <Button onPress={() => setCreateOpen(true)} size="sm">
            <Icon as={Plus} className="size-3.5 text-primary-foreground" />
            <Text className="text-xs text-primary-foreground">새 프로젝트</Text>
          </Button>
        </View>
      </View>

      <DashboardQueryBoundary
        fallback={<DashboardLoading label="프로젝트 목록을 불러오는 중..." />}
        resetKeys={[organizationId]}
        title="프로젝트 목록을 불러오지 못했습니다"
      >
        <ProjectsOverviewContent
          organizationId={organizationId}
          openProject={openProject}
          onCreate={() => setCreateOpen(true)}
        />
      </DashboardQueryBoundary>
      {createOpen ? (
        <DashboardQueryBoundary
          fallback={
            <DashboardLoading label="프로젝트 생성 정보를 불러오는 중..." />
          }
          resetKeys={[organizationId]}
          title="멤버 목록을 불러오지 못했습니다"
        >
          <ProjectCreationContent
            organizationId={organizationId}
            onOpenChange={setCreateOpen}
          />
        </DashboardQueryBoundary>
      ) : null}
    </View>
  );
}

function OverviewViewSwitcher({
  organizationId,
  openProject,
}: {
  organizationId: string;
  openProject: (id: string, view: 'board' | 'list') => void;
}) {
  const projects = useProjects(organizationId).data.items;
  const onlyProjectId = projects.length === 1 ? projects[0]?.id : undefined;
  return (
    <ProjectViewSwitcher
      activeView="overview"
      disabledViews={onlyProjectId ? [] : ['board', 'list']}
      onSelectView={(view) => {
        if (view !== 'overview' && onlyProjectId)
          openProject(onlyProjectId, view);
      }}
    />
  );
}
function ProjectsOverviewContent({
  organizationId,
  openProject,
  onCreate,
}: {
  organizationId: string;
  openProject: (id: string, view: 'board' | 'list') => void;
  onCreate: () => void;
}) {
  const projects = useProjects(organizationId).data.items;
  return (
    <ScrollView className="min-h-0 flex-1">
      <View className="w-full max-w-7xl self-center px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <View className="mb-6">
          <Text className="text-xl font-bold tracking-tight sm:text-2xl">
            프로젝트
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground sm:text-sm">
            실제 이슈 통계와 담당자를 기준으로 진행 상황을 확인합니다.
          </Text>
        </View>

        {projects.length === 0 ? (
          <View className="items-center rounded-xl border border-dashed border-border py-16">
            <Text className="text-sm font-semibold">
              아직 프로젝트가 없습니다
            </Text>
            <Text className="mt-1.5 text-center text-xs text-muted-foreground">
              첫 프로젝트를 만들면 기본 Kanban 컬럼이 자동으로 준비됩니다.
            </Text>
            <Button className="mt-4" onPress={onCreate} size="sm">
              <Icon as={Plus} className="size-3.5 text-primary-foreground" />
              <Text className="text-xs text-primary-foreground">
                프로젝트 만들기
              </Text>
            </Button>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-4">
            {projects.map((project) => (
              <View className="w-full md:w-[48%] lg:w-[31%]" key={project.id}>
                <ProjectOverviewCard
                  onOpenBoard={() => openProject(project.id, 'board')}
                  onOpenList={() => openProject(project.id, 'list')}
                  project={project}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
function ProjectCreationContent(
  props: Omit<
    React.ComponentProps<typeof CreateProjectDialog>,
    'members' | 'open'
  >,
) {
  const members = useProjectMembers(props.organizationId);
  return <CreateProjectDialog {...props} members={members} open />;
}
