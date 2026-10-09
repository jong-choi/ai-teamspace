import type {
  RequestQuotaAction,
  RequestQuotaPolicy,
} from '@/knowledge-graph/domain/request-quota';

export abstract class RequestQuotaRepository {
  abstract consume(input: {
    action: RequestQuotaAction;
    organizationId: string;
    actorUserId: string | null;
    policy: RequestQuotaPolicy;
  }): Promise<{ windowStartAt: Date; retryAfterSeconds: number }>;
}
