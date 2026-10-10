import { useDeferredValue, useMemo, useState, useTransition } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import type { ProjectsControllerListTicketsParams } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Skeleton } from '@repo/client/rnr/components/ui/skeleton';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  DashboardBreadcrumbItem,
  DashboardBreadcrumbSeparator,
  DashboardPageHeader,
} from '@core/app/shell/dashboard-page-header';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import { CreateTicketDialog } from '@core/features/projects/components/create-ticket-dialog';
import { KanbanBoard } from '@core/features/projects/components/kanban-board';
import { ProjectToolbar } from '@core/features/projects/components/project-toolbar';
import {
  type ProjectView,
  ProjectViewSwitcher,
} from '@core/features/projects/components/project-view-switcher';
import { TicketDetailDrawer } from '@core/features/projects/components/ticket-detail-drawer';
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
          key={projectId}
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
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [columnId, setColumnId] = useState<string | undefined>();
  const [assigneeUserId, setAssigneeUserId] = useState<string | undefined>();
  const [priority, setPriority] =
    useState<ProjectsControllerListTicketsParams['priority']>();
  const [createColumnId, setCreateColumnId] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const params = useMemo<ProjectsControllerListTicketsParams>(
    () => ({
      ...(deferredSearch ? { search: deferredSearch } : {}),
      ...(columnId ? { columnId } : {}),
      ...(assigneeUserId ? { assigneeUserId } : {}),
      ...(priority ? { priority } : {}),
    }),
    [deferredSearch, columnId, assigneeUserId, priority],
  );
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
  const changeProject = (nextProjectId: string) =>
    router.replace({
      pathname: '/projects/[projectId]',
      params: { projectId: nextProjectId, view },
    });
  const openCreateTicket = (targetColumnId?: string) => {
    setCreateColumnId(targetColumnId);
    setCreateOpen(true);
  };
  return (
    <View className="min-h-0 flex-1 bg-background">
      <DashboardPageHeader
        actions={
          <>
            <ProjectViewSwitcher
              activeView={view}
              onSelectView={navigateView}
            />
            <Button onPress={() => openCreateTicket()} size="sm">
              <Icon as={Plus} className="size-3.5 text-primary-foreground" />
              <Text className="text-xs text-primary-foreground">새 이슈</Text>
            </Button>
          </>
        }
      >
        <DashboardBreadcrumbItem>프로젝트</DashboardBreadcrumbItem>
        <DashboardBreadcrumbSeparator />
        <DashboardQueryBoundary
          fallback={<Skeleton className="h-4 w-28" />}
          resetKeys={[organizationId, projectId]}
        >
          <ProjectName organizationId={organizationId} projectId={projectId} />
        </DashboardQueryBoundary>
        <DashboardBreadcrumbSeparator className="hidden sm:flex" />
        <DashboardBreadcrumbItem className="hidden sm:flex">
          {view === 'board' ? '보드' : '목록'}
        </DashboardBreadcrumbItem>
      </DashboardPageHeader>
      <DashboardQueryBoundary
        fallback={
          <ProjectToolbar
            projects={[]}
            columns={[]}
            members={[]}
            projectId={projectId}
            search={search}
            onSearchChange={setSearch}
            onProjectChange={changeProject}
            onColumnChange={setColumnId}
            onAssigneeChange={setAssigneeUserId}
            onPriorityChange={setPriority}
          />
        }
        resetKeys={[organizationId, projectId]}
        title="프로젝트 필터를 불러오지 못했습니다"
      >
        <ProjectToolbarContent
          organizationId={organizationId}
          projectId={projectId}
          assigneeUserId={assigneeUserId}
          columnId={columnId}
          priority={priority}
          search={search}
          onSearchChange={setSearch}
          onProjectChange={changeProject}
          onColumnChange={(value) =>
            startFilterTransition(() => setColumnId(value))
          }
          onAssigneeChange={(value) =>
            startFilterTransition(() => setAssigneeUserId(value))
          }
          onPriorityChange={(value) =>
            startFilterTransition(() => setPriority(value))
          }
        />
      </DashboardQueryBoundary>
      <DashboardQueryBoundary
        fallback={<DashboardLoading label="이슈를 불러오는 중..." />}
        resetKeys={[organizationId, projectId, params]}
      >
        <ProjectTicketsContent
          organizationId={organizationId}
          projectId={projectId}
          params={params}
          view={view}
          onCreateTicket={openCreateTicket}
          onOpenTicket={setSelectedTicketId}
        />
      </DashboardQueryBoundary>
      {createOpen || selectedTicketId ? (
        <DashboardQueryBoundary
          fallback={<DashboardLoading label="이슈 정보를 불러오는 중..." />}
          resetKeys={[organizationId, projectId]}
        >
          <ProjectDialogs
            organizationId={organizationId}
            projectId={projectId}
            createOpen={createOpen}
            createColumnId={createColumnId}
            setCreateOpen={setCreateOpen}
            selectedTicketId={selectedTicketId}
            setSelectedTicketId={setSelectedTicketId}
          />
        </DashboardQueryBoundary>
      ) : null}
    </View>
  );
}

function ProjectName({
  organizationId,
  projectId,
}: {
  organizationId: string;
  projectId: string;
}) {
  const project = useProject(organizationId, projectId).data;
  return (
    <DashboardBreadcrumbItem className="max-w-48 truncate" current>
      {project.name}
    </DashboardBreadcrumbItem>
  );
}
function ProjectToolbarContent({
  organizationId,
  ...props
}: Omit<
  React.ComponentProps<typeof ProjectToolbar>,
  'projects' | 'columns' | 'members'
> & { organizationId: string }) {
  const projects = useProjects(organizationId).data.items;
  const columns = useProjectColumns(organizationId, props.projectId).data.items;
  const members = useProjectMembers(organizationId);
  return (
    <ProjectToolbar
      {...props}
      projects={projects}
      columns={columns}
      members={members}
    />
  );
}
function ProjectTicketsContent({
  organizationId,
  projectId,
  params,
  view,
  onCreateTicket,
  onOpenTicket,
}: {
  organizationId: string;
  projectId: string;
  params: ProjectsControllerListTicketsParams;
  view: 'board' | 'list';
  onCreateTicket: (columnId?: string) => void;
  onOpenTicket: (id: string) => void;
}) {
  const project = useProject(organizationId, projectId).data;
  const columns = useProjectColumns(organizationId, projectId).data.items;
  const tickets = useProjectTickets(organizationId, projectId, params).data
    .items;
  const moveMutation = useMoveTicketMutation({
    organizationId,
    projectId,
    params,
  });
  const moveTicket = (intent: KanbanDropIntent) => {
    moveMutation.move(intent.ticketId, {
      targetColumnId: intent.targetColumnId,
      beforeTicketId: intent.beforeTicketId,
      afterTicketId: intent.afterTicketId,
    });
  };

  return view === 'board' ? (
    <KanbanBoard
      columns={columns}
      disabled={moveMutation.isPending}
      onCreateTicket={onCreateTicket}
      onDropIntent={moveTicket}
      onOpenTicket={onOpenTicket}
      projectKey={project.key}
      tickets={tickets}
    />
  ) : (
    <TicketList
      columns={columns}
      onOpenTicket={onOpenTicket}
      projectName={project.name}
      tickets={tickets}
    />
  );
}
function ProjectDialogs({
  organizationId,
  projectId,
  createOpen,
  createColumnId,
  setCreateOpen,
  selectedTicketId,
  setSelectedTicketId,
}: {
  organizationId: string;
  projectId: string;
  createOpen: boolean;
  createColumnId?: string;
  setCreateOpen: (open: boolean) => void;
  selectedTicketId: string | null;
  setSelectedTicketId: (id: string | null) => void;
}) {
  const project = useProject(organizationId, projectId).data;
  const columns = useProjectColumns(organizationId, projectId).data.items;
  const members = useProjectMembers(organizationId);
  return (
    <>
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

      <TicketDetailDrawer
        columns={columns}
        members={members}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelectedTicketId(null);
        }}
        open={selectedTicketId !== null}
        organizationId={organizationId}
        projectId={projectId}
        projectName={project.name}
        ticketId={selectedTicketId}
      />
    </>
  );
}
