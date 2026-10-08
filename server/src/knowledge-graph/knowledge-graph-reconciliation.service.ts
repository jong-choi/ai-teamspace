import { Injectable, Logger } from '@nestjs/common';

import {
  ORGANIZATION_DISCOVERY_BATCH,
  SCOPE_WORK_BUDGET_MS,
} from '@/knowledge-graph/domain/reconciliation-scope';
import { ProjectionDeliveryRepository } from '@/knowledge-graph/infrastructure/persistence/projection-delivery.repository';
import { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import { ReconciliationScopeRepository } from '@/knowledge-graph/infrastructure/persistence/reconciliation-scope.repository';
import { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';

const OWNER_SOURCE_BATCH = 100;
const MEMBERSHIP_OWNER_RESCAN_DELAY_MS = 15 * 60_000;
const OWNER_RESCAN_DELAY_MS = 6 * 60 * 60_000;
const MEMBERSHIP_OBSERVATION_BATCH = 100;
const MEMBERSHIP_CYCLE_DELAY_MS = 5 * 60_000;
const PRESENCE_BATCH = 100;
const PRESENCE_CYCLE_DELAY_MS = 10 * 60_000;
const PRESENCE_ANOMALY_MIN = 5;
const PRESENCE_ANOMALY_RATIO = 0.2;

@Injectable()
export class KnowledgeGraphReconciliationService {
  private readonly logger = new Logger(
    KnowledgeGraphReconciliationService.name,
  );
  constructor(
    private readonly scopes: ReconciliationScopeRepository,
    private readonly sources: WorkosSourceProvider,
    private readonly state: ProjectionStateRepository,
    private readonly delivery: ProjectionDeliveryRepository,
  ) {}
  initialize() {
    return this.scopes.initialize();
  }
  async discoverOrganizations(): Promise<number | null> {
    const scope = await this.scopes.claim('organizations');
    if (!scope) return null;
    try {
      const ids = await this.sources.organizationIds(
        scope.afterOrganizationId,
        ORGANIZATION_DISCOVERY_BATCH,
      );
      return (await this.scopes.registerOrganizations(scope, ids))
        ? ids.length
        : 0;
    } catch (error) {
      await this.scopes.releaseFailed(scope);
      throw error;
    }
  }
  async discoverOwnerSources(): Promise<number | null> {
    const scope = await this.scopes.claim('owner_sources');
    if (!scope) return null;
    try {
      if (!scope.organizationId || !scope.aggregateKind)
        throw new Error('KNOWLEDGE_GRAPH_RECONCILIATION_SCOPE_INVALID');
      const rows = await this.sources.listIds(
        scope.aggregateKind,
        scope.organizationId,
        scope.afterAggregateId,
        OWNER_SOURCE_BATCH,
      );
      if (
        !(await this.delivery.initializeBatch(
          scope.aggregateKind,
          scope.organizationId,
          rows,
          scope,
        ))
      )
        return 0;
      const exhausted = rows.length < OWNER_SOURCE_BATCH;
      const completed = await this.scopes.complete(
        scope,
        {
          afterAggregateId: exhausted ? null : (rows.at(-1)?.id ?? null),
        },
        {
          failed: false,
          delayMs: exhausted
            ? scope.aggregateKind === 'membership'
              ? MEMBERSHIP_OWNER_RESCAN_DELAY_MS
              : OWNER_RESCAN_DELAY_MS
            : 0,
        },
      );
      return completed ? rows.length : 0;
    } catch (error) {
      await this.scopes.releaseFailed(scope);
      throw error;
    }
  }
  async observeMemberships(): Promise<number | null> {
    const scope = await this.scopes.claim('membership_sources');
    if (!scope) return null;
    const deadline = Date.now() + SCOPE_WORK_BUDGET_MS;
    try {
      const cursor =
        scope.afterOrganizationId && scope.afterAggregateId
          ? {
              organizationId: scope.afterOrganizationId,
              aggregateId: scope.afterAggregateId,
            }
          : null;
      const rows = await this.state.listMembershipObservationBatch(
        cursor,
        MEMBERSHIP_OBSERVATION_BATCH,
      );
      let changed = 0;
      let failed = false;
      let processed: (typeof rows)[number] | null = null;
      for (const source of rows) {
        if (Date.now() >= deadline) break;
        let result: Awaited<
          ReturnType<ProjectionDeliveryRepository['recordObservedSnapshot']>
        >;
        try {
          const snapshot = await this.sources.observeMembershipSnapshot(
            source.organizationId,
            source.aggregateId,
          );
          result = await this.delivery.recordObservedSnapshot(
            source,
            snapshot,
            scope,
          );
        } catch (error) {
          failed = true;
          // 순환 cursor는 실패한 원본도 다음 주기에 다시 방문하며 뒤 원본 처리를 계속한다.
          this.logger.warn({
            event: 'knowledge_graph_membership_observation_failed',
            errorName: error instanceof Error ? error.name : 'UnknownError',
          });
          processed = source;
          continue;
        }
        if (result === 'lease_lost') return 0;
        if (result === 'recorded') changed += 1;
        processed = source;
      }
      const exhausted =
        rows.length === 0 ||
        (rows.length < MEMBERSHIP_OBSERVATION_BATCH &&
          processed === rows.at(-1));
      const completed = await this.scopes.complete(
        scope,
        {
          afterOrganizationId: exhausted
            ? null
            : (processed?.organizationId ?? scope.afterOrganizationId),
          afterAggregateId: exhausted
            ? null
            : (processed?.aggregateId ?? scope.afterAggregateId),
        },
        { failed, delayMs: exhausted ? MEMBERSHIP_CYCLE_DELAY_MS : 0 },
      );
      return completed ? changed : 0;
    } catch (error) {
      await this.scopes.releaseFailed(scope);
      throw error;
    }
  }
  async observeOrganizationPresence(): Promise<number | null> {
    const scope = await this.scopes.claim('organization_presence');
    if (!scope) return null;
    const deadline = Date.now() + SCOPE_WORK_BUDGET_MS;
    try {
      const ids = await this.state.listTrackedOrganizationIds(
        scope.afterOrganizationId,
        PRESENCE_BATCH,
      );
      const existing = new Set(await this.sources.existingOrganizationIds(ids));
      const missing = ids.filter((id) => !existing.has(id));
      if (
        missing.length >
        Math.max(
          PRESENCE_ANOMALY_MIN,
          Math.ceil(ids.length * PRESENCE_ANOMALY_RATIO),
        )
      ) {
        this.logger.error({
          event: 'knowledge_graph_organization_presence_anomaly',
          checked: ids.length,
          missing: missing.length,
        });
        await this.scopes.complete(
          scope,
          {},
          {
            failed: true,
            delayMs: PRESENCE_CYCLE_DELAY_MS,
            lastError: 'KNOWLEDGE_GRAPH_ORGANIZATION_PRESENCE_ANOMALY',
          },
        );
        return 0;
      }
      let changed = 0;
      let processed = scope.afterOrganizationId;
      let finished = true;
      for (const id of ids) {
        if (Date.now() >= deadline) {
          finished = false;
          break;
        }
        if (!existing.has(id) && !(await this.sources.organizationExists(id))) {
          let cursor: Parameters<
            ProjectionStateRepository['listLiveSourcesForOrganization']
          >[1] = null;
          let organizationFinished = false;
          while (Date.now() < deadline) {
            const rows = await this.state.listLiveSourcesForOrganization(
              id,
              cursor,
              PRESENCE_BATCH,
            );
            if (rows.length === 0) {
              if (!(await this.scopes.removeOrganizationScopes(scope, id)))
                return 0;
              organizationFinished = true;
              break;
            }
            const recorded = await this.delivery.recordOrganizationTombstones(
              scope,
              rows,
            );
            if (recorded === null) return 0;
            changed += recorded;
            const last = rows.at(-1);
            cursor = last
              ? {
                  aggregateKind: last.aggregateKind,
                  aggregateId: last.aggregateId,
                }
              : cursor;
          }
          if (!organizationFinished) {
            finished = false;
            break;
          }
        }
        processed = id;
      }
      const exhausted = finished && ids.length < PRESENCE_BATCH;
      const completed = await this.scopes.complete(
        scope,
        { afterOrganizationId: exhausted ? null : processed },
        { failed: false, delayMs: exhausted ? PRESENCE_CYCLE_DELAY_MS : 0 },
      );
      return completed ? changed : 0;
    } catch (error) {
      await this.scopes.releaseFailed(scope);
      throw error;
    }
  }
}
