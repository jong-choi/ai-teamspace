import { useLocalSearchParams } from 'expo-router';

import { ProjectKanbanRoute } from '@core/features/projects/project-kanban-route';

export default function ProjectPage() {
  const params = useLocalSearchParams<{
    projectId?: string | string[];
    view?: string | string[];
  }>();
  const projectId = firstParam(params.projectId);
  const view = firstParam(params.view) === 'list' ? 'list' : 'board';

  if (!projectId) return null;
  return <ProjectKanbanRoute projectId={projectId} view={view} />;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
