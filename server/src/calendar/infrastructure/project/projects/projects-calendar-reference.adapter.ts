import { Injectable } from '@nestjs/common';

import { CalendarProjectNotFoundError } from '@/calendar/domain/calendar.error';
import type { CalendarProjectSummary } from '@/calendar/domain/calendar-project-summary';
import { CalendarProjectReferenceProvider } from '@/calendar/infrastructure/project/calendar-project-reference.provider';
import { ProjectReferenceQueryService } from '@/projects/project-reference-query.service';

@Injectable()
export class ProjectsCalendarReferenceAdapter extends CalendarProjectReferenceProvider {
  constructor(private readonly projects: ProjectReferenceQueryService) {
    super();
  }

  async assertReference(
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    const references = await this.projects.findReferences(organizationId, [
      projectId,
    ]);
    if (!references.some(({ id }) => id === projectId)) {
      throw new CalendarProjectNotFoundError();
    }
  }

  listSummaries(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<CalendarProjectSummary[]> {
    return this.projects.findReferences(organizationId, projectIds);
  }
}
