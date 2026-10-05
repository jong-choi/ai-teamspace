import { Injectable } from '@nestjs/common';

import { CalendarProjectIntegrationUnavailableError } from '#server/calendar/domain/calendar.error.js';
import type { CalendarProjectSummary } from '#server/calendar/domain/calendar-project-summary.js';
import { CalendarProjectReferenceProvider } from '#server/calendar/infrastructure/project/calendar-project-reference.provider.js';

@Injectable()
export class UnavailableCalendarProjectReferenceAdapter extends CalendarProjectReferenceProvider {
  assertReference(organizationId: string, projectId: string): Promise<void> {
    void organizationId;
    void projectId;
    return Promise.reject(new CalendarProjectIntegrationUnavailableError());
  }

  listSummaries(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<CalendarProjectSummary[]> {
    void organizationId;
    if (projectIds.length > 0) {
      return Promise.reject(new CalendarProjectIntegrationUnavailableError());
    }
    return Promise.resolve([]);
  }
}
