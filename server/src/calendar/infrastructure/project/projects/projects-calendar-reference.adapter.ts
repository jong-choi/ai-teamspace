import { Injectable } from '@nestjs/common';

import { CalendarProjectNotFoundError } from '#server/calendar/domain/calendar.error.js';
import type { CalendarProjectSummary } from '#server/calendar/domain/calendar-project-summary.js';
import { CalendarProjectReferenceProvider } from '#server/calendar/infrastructure/project/calendar-project-reference.provider.js';
import { ProjectReferenceQueryService } from '#server/projects/project-reference-query.service.js';

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
