import type { CalendarProjectSummary } from '#server/calendar/domain/calendar-project-summary.js';

export abstract class CalendarProjectReferenceProvider {
  abstract assertReference(
    organizationId: string,
    projectId: string,
  ): Promise<void>;

  abstract listSummaries(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<CalendarProjectSummary[]>;
}
