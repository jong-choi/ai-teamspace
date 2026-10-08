import { Test } from '@nestjs/testing';

import { ReconciliationScopeSchema } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.zod';
import { ProjectionDeliveryRepository } from '@/knowledge-graph/infrastructure/persistence/projection-delivery.repository';
import { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import { ReconciliationScopeRepository } from '@/knowledge-graph/infrastructure/persistence/reconciliation-scope.repository';
import { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';
import { KnowledgeGraphReconciliationService } from '@/knowledge-graph/knowledge-graph-reconciliation.service';
import { OutboxAggregateVersionSchema } from '@/outbox/outbox-aggregate-event.schema';

describe('P6 기획의 원본 발견·관찰·조직 삭제 복구', () => {
  const scopes = {
    initialize: jest.fn(),
    claim: jest.fn(),
    complete: jest.fn(),
    registerOrganizations: jest.fn(),
    removeOrganizationScopes: jest.fn(),
    releaseFailed: jest.fn(),
  };
  const sources = {
    organizationIds: jest.fn(),
    listIds: jest.fn(),
    observeMembershipSnapshot: jest.fn(),
    existingOrganizationIds: jest.fn(),
    organizationExists: jest.fn(),
  };
  const state = {
    listMembershipObservationBatch: jest.fn(),
    listTrackedOrganizationIds: jest.fn(),
    listLiveSourcesForOrganization: jest.fn(),
  };
  const delivery = {
    initializeBatch: jest.fn(),
    recordObservedSnapshot: jest.fn(),
    recordOrganizationTombstones: jest.fn(),
  };
  let service: KnowledgeGraphReconciliationService;
  const scope = (
    purpose: Parameters<ReconciliationScopeRepository['claim']>[0],
    aggregateKind: 'membership' | 'project' = 'membership',
  ) =>
    ReconciliationScopeSchema.parse({
      id: purpose,
      purpose,
      organizationId: purpose === 'owner_sources' ? 'org' : null,
      aggregateKind: purpose === 'owner_sources' ? aggregateKind : null,
      afterOrganizationId: null,
      afterAggregateId: null,
      leaseToken: '11111111-1111-4111-8111-111111111111',
      leaseUntil: new Date('2030-01-01'),
      nextRunAt: new Date(0),
      failureCount: 0,
      lastError: null,
      updatedAt: new Date(0),
    });
  const source = (id: string) =>
    OutboxAggregateVersionSchema.parse({
      organizationId: 'org',
      aggregateKind: 'membership',
      aggregateId: id,
      desiredSeq: 1,
      appliedSeq: 1,
      deleted: false,
      projectionStatus: 'applied',
      lastAttemptedAt: null,
      appliedAt: null,
      appliedSnapshotDigest: null,
      lastRequeuedAt: null,
      requeueCount: 0,
      lastError: null,
      updatedAt: new Date(0),
    });

  beforeEach(async () => {
    jest.resetAllMocks();
    scopes.claim.mockResolvedValue(null);
    scopes.complete.mockResolvedValue(true);
    scopes.removeOrganizationScopes.mockResolvedValue(true);
    delivery.initializeBatch.mockResolvedValue(true);
    delivery.recordObservedSnapshot.mockResolvedValue('recorded');
    sources.observeMembershipSnapshot.mockResolvedValue({
      deleted: false,
      snapshotDigest: 'a'.repeat(64),
    });
    state.listMembershipObservationBatch.mockResolvedValue([]);
    state.listTrackedOrganizationIds.mockResolvedValue([]);
    state.listLiveSourcesForOrganization.mockResolvedValue([]);
    sources.existingOrganizationIds.mockResolvedValue([]);
    sources.organizationExists.mockResolvedValue(false);
    const module = await Test.createTestingModule({
      providers: [
        KnowledgeGraphReconciliationService,
        { provide: ReconciliationScopeRepository, useValue: scopes },
        { provide: WorkosSourceProvider, useValue: sources },
        { provide: ProjectionStateRepository, useValue: state },
        { provide: ProjectionDeliveryRepository, useValue: delivery },
      ],
    }).compile();
    service = module.get(KnowledgeGraphReconciliationService);
  });
  afterEach(() => jest.restoreAllMocks());

  it('U-01 claim이 없으면 네 목적 모두 null이고 원본을 조회하지 않는다', async () => {
    expect(await service.discoverOrganizations()).toBeNull();
    expect(await service.discoverOwnerSources()).toBeNull();
    expect(await service.observeMemberships()).toBeNull();
    expect(await service.observeOrganizationPresence()).toBeNull();
    expect(sources.organizationIds).not.toHaveBeenCalled();
    expect(sources.listIds).not.toHaveBeenCalled();
    expect(state.listMembershipObservationBatch).not.toHaveBeenCalled();
    expect(state.listTrackedOrganizationIds).not.toHaveBeenCalled();
  });
  it('U-02 마감이 오면 완료한 membership까지만 cursor를 기록한다', async () => {
    const owned = scope('membership_sources');
    scopes.claim.mockResolvedValue(owned);
    state.listMembershipObservationBatch.mockResolvedValue([
      source('1'),
      source('2'),
      source('3'),
    ]);
    jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(90_001);
    expect(await service.observeMemberships()).toBe(2);
    expect(sources.observeMembershipSnapshot).toHaveBeenCalledTimes(2);
    expect(scopes.complete).toHaveBeenCalledWith(
      owned,
      { afterOrganizationId: 'org', afterAggregateId: '2' },
      { failed: false, delayMs: 0 },
    );
  });
  it('U-03 빈 membership batch는 cursor를 초기화하고 5분 뒤 순환한다', async () => {
    const owned = {
      ...scope('membership_sources'),
      afterOrganizationId: 'org',
      afterAggregateId: 'old',
    };
    scopes.claim.mockResolvedValue(owned);
    expect(await service.observeMemberships()).toBe(0);
    expect(scopes.complete).toHaveBeenCalledWith(
      owned,
      { afterOrganizationId: null, afterAggregateId: null },
      { failed: false, delayMs: 300_000 },
    );
  });
  it('U-04 가득 찬 membership batch는 지연 없이 다음 cursor를 진행한다', async () => {
    scopes.claim.mockResolvedValue(scope('membership_sources'));
    state.listMembershipObservationBatch.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => source(String(i))),
    );
    expect(await service.observeMemberships()).toBe(100);
    expect(scopes.complete).toHaveBeenCalledWith(
      expect.anything(),
      { afterOrganizationId: 'org', afterAggregateId: '99' },
      { failed: false, delayMs: 0 },
    );
  });
  it('U-05 lease 상실은 즉시 중단하고 cursor를 쓰지 않는다', async () => {
    scopes.claim.mockResolvedValue(scope('membership_sources'));
    state.listMembershipObservationBatch.mockResolvedValue([
      source('1'),
      source('2'),
    ]);
    delivery.recordObservedSnapshot.mockResolvedValueOnce('lease_lost');
    expect(await service.observeMemberships()).toBe(0);
    expect(sources.observeMembershipSnapshot).toHaveBeenCalledTimes(1);
    expect(scopes.complete).not.toHaveBeenCalled();
  });
  it('U-06 한 membership 조회 실패 뒤에도 다음 항목을 처리하고 실패를 기록한다', async () => {
    scopes.claim.mockResolvedValue(scope('membership_sources'));
    state.listMembershipObservationBatch.mockResolvedValue([
      source('1'),
      source('2'),
    ]);
    sources.observeMembershipSnapshot.mockRejectedValueOnce(
      new Error('조회 실패'),
    );
    expect(await service.observeMemberships()).toBe(1);
    expect(delivery.recordObservedSnapshot).toHaveBeenCalledWith(
      source('2'),
      expect.anything(),
      expect.anything(),
    );
    expect(scopes.complete).toHaveBeenCalledWith(
      expect.anything(),
      { afterOrganizationId: null, afterAggregateId: null },
      { failed: true, delayMs: 300_000 },
    );
  });
  it('U-07 존재하는 조직은 tombstone을 기록하지 않는다', async () => {
    scopes.claim.mockResolvedValue(scope('organization_presence'));
    state.listTrackedOrganizationIds.mockResolvedValue(['org']);
    sources.existingOrganizationIds.mockResolvedValue(['org']);
    expect(await service.observeOrganizationPresence()).toBe(0);
    expect(delivery.recordOrganizationTombstones).not.toHaveBeenCalled();
  });
  it('U-08 사라진 조직을 재확인한 뒤 tombstone하고 완료 후 owner scope를 제거한다', async () => {
    const owned = scope('organization_presence');
    scopes.claim.mockResolvedValue(owned);
    state.listTrackedOrganizationIds.mockResolvedValue(['org']);
    state.listLiveSourcesForOrganization.mockResolvedValueOnce([source('1')]);
    delivery.recordOrganizationTombstones.mockResolvedValue(1);
    expect(await service.observeOrganizationPresence()).toBe(1);
    expect(sources.organizationExists).toHaveBeenCalledWith('org');
    expect(delivery.recordOrganizationTombstones).toHaveBeenCalledWith(owned, [
      source('1'),
    ]);
    expect(sources.organizationExists.mock.invocationCallOrder[0]).toBeLessThan(
      delivery.recordOrganizationTombstones.mock.invocationCallOrder[0],
    );
    expect(
      delivery.recordOrganizationTombstones.mock.invocationCallOrder[0],
    ).toBeLessThan(scopes.removeOrganizationScopes.mock.invocationCallOrder[0]);
    expect(scopes.removeOrganizationScopes).toHaveBeenCalledWith(owned, 'org');
  });
  it('U-09 개별 재확인에서 존재하면 tombstone하지 않는다', async () => {
    scopes.claim.mockResolvedValue(scope('organization_presence'));
    state.listTrackedOrganizationIds.mockResolvedValue(['org']);
    sources.organizationExists.mockResolvedValue(true);
    expect(await service.observeOrganizationPresence()).toBe(0);
    expect(delivery.recordOrganizationTombstones).not.toHaveBeenCalled();
  });
  it('U-10 대량 missing 이상치는 tombstone 없이 실패 코드와 지연을 남긴다', async () => {
    scopes.claim.mockResolvedValue(scope('organization_presence'));
    state.listTrackedOrganizationIds.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => `org-${i}`),
    );
    expect(await service.observeOrganizationPresence()).toBe(0);
    expect(delivery.recordOrganizationTombstones).not.toHaveBeenCalled();
    expect(scopes.complete).toHaveBeenCalledWith(
      expect.anything(),
      {},
      {
        failed: true,
        delayMs: 600_000,
        lastError: 'KNOWLEDGE_GRAPH_ORGANIZATION_PRESENCE_ANOMALY',
      },
    );
  });
  it('U-11 Better Auth 조회 예외는 tombstone 없이 lease를 해제하고 전파한다', async () => {
    const owned = scope('organization_presence');
    scopes.claim.mockResolvedValue(owned);
    state.listTrackedOrganizationIds.mockResolvedValue(['org']);
    sources.existingOrganizationIds.mockRejectedValue(
      new Error('원본 조회 불가'),
    );
    await expect(service.observeOrganizationPresence()).rejects.toThrow(
      '원본 조회 불가',
    );
    expect(delivery.recordOrganizationTombstones).not.toHaveBeenCalled();
    expect(scopes.releaseFailed).toHaveBeenCalledWith(owned);
  });
  it('U-12 조직 처리가 마감되면 완료하지 못한 조직 직전 cursor를 유지한다', async () => {
    const owned = scope('organization_presence');
    scopes.claim.mockResolvedValue(owned);
    state.listTrackedOrganizationIds.mockResolvedValue(['a', 'b']);
    sources.existingOrganizationIds.mockResolvedValue(['a']);
    state.listLiveSourcesForOrganization.mockResolvedValueOnce([source('1')]);
    delivery.recordOrganizationTombstones.mockResolvedValue(1);
    jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(90_001);
    expect(await service.observeOrganizationPresence()).toBe(1);
    expect(scopes.complete).toHaveBeenCalledWith(
      owned,
      { afterOrganizationId: 'a' },
      { failed: false, delayMs: 0 },
    );
    expect(scopes.removeOrganizationScopes).not.toHaveBeenCalled();
  });
  it.each([
    ['membership', 900_000],
    ['project', 21_600_000],
  ] as const)(
    'U-13 %s 초기 발견 한 바퀴 뒤 지정 간격으로 재스캔한다',
    async (kind, delayMs) => {
      const owned = scope('owner_sources', kind);
      scopes.claim.mockResolvedValue(owned);
      sources.listIds.mockResolvedValue([]);
      expect(await service.discoverOwnerSources()).toBe(0);
      expect(scopes.complete).toHaveBeenCalledWith(
        owned,
        { afterAggregateId: null },
        { failed: false, delayMs },
      );
    },
  );
});
