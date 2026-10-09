export abstract class SearchQuotaRepository {
  abstract consume(input: {
    organizationId: string;
    actorUserId: string;
  }): Promise<void>;
}
