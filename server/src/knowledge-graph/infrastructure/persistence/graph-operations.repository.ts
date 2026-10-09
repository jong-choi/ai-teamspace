export abstract class GraphOperationsRepository {
  abstract quotaUsage(organizationId: string): Promise<{
    refreshUsedThisHour: number;
    searchUsedThisMinute: number;
  }>;
}
