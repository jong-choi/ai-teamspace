import type { CalendarProjectSummary } from '@/calendar/domain/calendar-project-summary';

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
