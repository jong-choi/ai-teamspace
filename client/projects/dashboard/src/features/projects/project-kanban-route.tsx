import { useDeferredValue, useMemo, useState, useTransition } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import type { ProjectsControllerListTicketsParams } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { CreateTicketDialog } from '@core/features/projects/components/create-ticket-dialog';
import { KanbanBoard } from '@core/features/projects/components/kanban-board';
import { ProjectToolbar } from '@core/features/projects/components/project-toolbar';
import {
  type ProjectView,
  ProjectViewSwitcher,
} from '@core/features/projects/components/project-view-switcher';
import { TicketList } from '@core/features/projects/components/ticket-list';
import type { KanbanDropIntent } from '@core/features/projects/dnd/kanban-dnd-adapter.shared';
import { useMoveTicketMutation } from '@core/features/projects/projects-mutations';
import {
  useProject,
  useProjectColumns,
  useProjectMembers,
  useProjects,
  useProjectTickets,
} from '@core/features/projects/projects-query';
import { ProjectsRouteFrame } from '@core/features/projects/projects-route-frame';

import { Plus } from 'lucide-react-native';

export function ProjectKanbanRoute({
  projectId,
  view,
}: {
  projectId: string;
  view: 'board' | 'list';
}) {
  return (
    <ProjectsRouteFrame resetKeys={[projectId]}>
      {(organizationId) => (
        <ProjectWorkspace
          organizationId={organizationId}
          projectId={projectId}
          view={view}
        />
      )}
    </ProjectsRouteFrame>
  );
}

function ProjectWorkspace({
  organizationId,
  projectId,
  view,
}: {
  organizationId: string;
  projectId: string;
  view: 'board' | 'list';
}) {
  const router = useRouter();
  const [, startFilterTransition] = useTransition();
  const project = useProject(organizationId, projectId).data;
  const projects = useProjects(organizationId).data.items;
  const columns = useProjectColumns(organizationId, projectId).data.items;
  const members = useProjectMembers(organizationId);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [columnId, setColumnId] = useState<string | undefined>();
  const [assigneeUserId, setAssigneeUserId] = useState<string | undefined>();
  const [priority, setPriority] =
    useState<ProjectsControllerListTicketsParams['priority']>();
  const [createColumnId, setCreateColumnId] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const params = useMemo<ProjectsControllerListTicketsParams>(
    () => ({
      ...(deferredSearch ? { search: deferredSearch } : {}),
      ...(columnId ? { columnId } : {}),
      ...(assigneeUserId ? { assigneeUserId } : {}),
      ...(priority ? { priority } : {}),
    }),
    [assigneeUserId, columnId, deferredSearch, priority],
  );
  const tickets = useProjectTickets(organizationId, projectId, params).data
    .items;
  const moveMutation = useMoveTicketMutation({
    organizationId,
    projectId,
    params,
  });

  const navigateView = (nextView: ProjectView) => {
    if (nextView === 'overview') {
      router.push('/projects');
      return;
    }
    router.replace({
      pathname: '/projects/[projectId]',
      params: { projectId, view: nextView },
    });
  };
  const changeProject = (nextProjectId: string) => {
    setColumnId(undefined);
    router.replace({
      pathname: '/projects/[projectId]',
      params: { projectId: nextProjectId, view },
    });
  };
  const openCreateTicket = (targetColumnId?: string) => {
    setCreateColumnId(targetColumnId ?? columns[0]?.id);
    setCreateOpen(true);
  };
  const moveTicket = (intent: KanbanDropIntent) => {
    moveMutation.move(intent.ticketId, {
      targetColumnId: intent.targetColumnId,
      beforeTicketId: intent.beforeTicketId,
      afterTicketId: intent.afterTicketId,
    });
  };

  return (
    <View className="min-h-0 flex-1 bg-background">
      <View className="shrink-0 flex-row items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-6">
        <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
          <Text className="text-xs text-muted-foreground">프로젝트</Text>
          <Text className="text-xs text-muted-foreground">/</Text>
          <Text className="max-w-48 truncate text-xs font-semibold">
            {project.name}
          </Text>
          <Text className="hidden text-xs text-muted-foreground sm:flex">
            /
          </Text>
          <Text className="hidden text-xs text-muted-foreground sm:flex">
            {view === 'board' ? '보드' : '목록'}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          <ProjectViewSwitcher activeView={view} onSelectView={navigateView} />
          <Button
            disabled={columns.length === 0}
            onPress={() => openCreateTicket()}
            size="sm"
          >
            <Icon as={Plus} className="size-3.5 text-primary-foreground" />
            <Text className="text-xs text-primary-foreground">새 이슈</Text>
          </Button>
        </View>
      </View>

      <ProjectToolbar
        assigneeUserId={assigneeUserId}
        columnId={columnId}
        columns={columns}
        members={members}
        onAssigneeChange={(value) =>
          startFilterTransition(() => setAssigneeUserId(value))
        }
        onColumnChange={(value) =>
          startFilterTransition(() => setColumnId(value))
        }
        onPriorityChange={(value) =>
          startFilterTransition(() => setPriority(value))
        }
        onProjectChange={changeProject}
        onSearchChange={setSearch}
        priority={priority}
        projectId={projectId}
        projects={projects}
        search={search}
      />

      {view === 'board' ? (
        <KanbanBoard
          columns={columns}
          disabled={moveMutation.isPending}
          onCreateTicket={openCreateTicket}
          onDropIntent={moveTicket}
          projectKey={project.key}
          tickets={tickets}
        />
      ) : (
        <TicketList
          columns={columns}
          projectName={project.name}
          tickets={tickets}
        />
      )}

      <CreateTicketDialog
        columns={columns}
        initialColumnId={createColumnId}
        key={createColumnId ?? 'default'}
        members={members}
        onOpenChange={setCreateOpen}
        open={createOpen}
        organizationId={organizationId}
        projectId={projectId}
      />
    </View>
  );
}
