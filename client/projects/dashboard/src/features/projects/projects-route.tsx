import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
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
  const projects = useProjects(organizationId).data.items;
  const members = useProjectMembers(organizationId);
  const [createOpen, setCreateOpen] = useState(false);
  const onlyProjectId = projects.length === 1 ? projects[0]?.id : undefined;

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
          <ProjectViewSwitcher
            activeView="overview"
            disabledViews={onlyProjectId ? [] : ['board', 'list']}
            onSelectView={(view) => {
              if (view === 'overview' || !onlyProjectId) return;
              openProject(onlyProjectId, view);
            }}
          />
          <Button onPress={() => setCreateOpen(true)} size="sm">
            <Icon as={Plus} className="size-3.5 text-primary-foreground" />
            <Text className="text-xs text-primary-foreground">새 프로젝트</Text>
          </Button>
        </View>
      </View>

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
              <Button
                className="mt-4"
                onPress={() => setCreateOpen(true)}
                size="sm"
              >
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

      <CreateProjectDialog
        members={members}
        onOpenChange={setCreateOpen}
        open={createOpen}
        organizationId={organizationId}
      />
    </View>
  );
}
