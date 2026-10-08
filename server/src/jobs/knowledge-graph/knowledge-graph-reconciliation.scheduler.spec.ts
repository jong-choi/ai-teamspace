import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { KnowledgeGraphReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-reconciliation.scheduler';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import { KnowledgeGraphBackfillService } from '@/knowledge-graph/knowledge-graph-backfill.service';
import { KnowledgeGraphReconciliationService } from '@/knowledge-graph/knowledge-graph-reconciliation.service';

describe('P6 기획의 목적별 bounded scheduler', () => {
  const reconciliation = {
    initialize: jest.fn(),
    discoverOrganizations: jest.fn(),
    discoverOwnerSources: jest.fn(),
    observeMemberships: jest.fn(),
    observeOrganizationPresence: jest.fn(),
  };
  const backfill = { requeueUnapplied: jest.fn() };
  const state = { recoveryStats: jest.fn() };
  const config = { enabled: true };
  let scheduler: KnowledgeGraphReconciliationScheduler;
  beforeEach(async () => {
    jest.resetAllMocks();
    config.enabled = true;
    reconciliation.initialize.mockResolvedValue(undefined);
    for (const run of [
      reconciliation.discoverOrganizations,
      reconciliation.discoverOwnerSources,
      reconciliation.observeMemberships,
      reconciliation.observeOrganizationPresence,
    ])
      run.mockResolvedValue(null);
    backfill.requeueUnapplied.mockResolvedValue(0);
    state.recoveryStats.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        KnowledgeGraphReconciliationScheduler,
        { provide: knowledgeGraphConfig.KEY, useValue: config },
        { provide: KnowledgeGraphBackfillService, useValue: backfill },
        {
          provide: KnowledgeGraphReconciliationService,
          useValue: reconciliation,
        },
        { provide: ProjectionStateRepository, useValue: state },
      ],
    }).compile();
    scheduler = module.get(KnowledgeGraphReconciliationScheduler);
  });
  afterEach(async () => {
    await scheduler.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('U-20 null 작업은 해당 목적의 drain을 끝낸다', async () => {
    expect(await scheduler.runOnce()).toBe(0);
    expect(reconciliation.discoverOwnerSources).toHaveBeenCalledTimes(1);
    expect(backfill.requeueUnapplied).toHaveBeenCalledTimes(1);
  });
  it('U-21 각 목적은 한 tick에 최대 20번까지 처리한다', async () => {
    reconciliation.discoverOwnerSources.mockResolvedValue(100);
    expect(await scheduler.runOnce()).toBe(2000);
    expect(reconciliation.discoverOwnerSources).toHaveBeenCalledTimes(20);
  });
  it('U-22 한 목적이 시간 예산을 넘으면 다음 claim을 하지 않는다', async () => {
    let now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    reconciliation.discoverOwnerSources.mockImplementation(async () => {
      now = 20_001;
      return 100;
    });
    expect(await scheduler.runOnce()).toBe(100);
    expect(reconciliation.discoverOwnerSources).toHaveBeenCalledTimes(1);
  });
  it('U-23 실패한 목적 외의 작업을 계속하고 task와 오류 이름만 로그에 남긴다', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    reconciliation.discoverOwnerSources.mockRejectedValue(
      new Error('민감한 주소와 원문'),
    );
    reconciliation.observeMemberships
      .mockResolvedValueOnce(1)
      .mockResolvedValue(null);
    expect(await scheduler.runOnce()).toBe(1);
    expect(log).toHaveBeenCalledWith({
      event: 'knowledge_graph_reconciliation_task_failed',
      task: 'owner_sources',
      errorName: 'Error',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('민감한');
  });
  it('U-24 초기화 실패는 다음 tick에서 재시도하고 성공 후 반복하지 않는다', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    reconciliation.initialize.mockRejectedValueOnce(new Error('초기화 실패'));
    await scheduler.runOnce();
    await scheduler.runOnce();
    await scheduler.runOnce();
    expect(reconciliation.initialize).toHaveBeenCalledTimes(2);
  });
  it('U-25 진행 중인 tick과 겹치지 않고 shutdown은 완료를 기다린다', async () => {
    let release = () => {};
    const blocked = new Promise<number>((resolve) => {
      release = () => resolve(0);
    });
    backfill.requeueUnapplied.mockReturnValueOnce(blocked);
    const running = scheduler.runOnce();
    expect(await scheduler.runOnce()).toBe(0);
    let closed = false;
    const closing = scheduler.onModuleDestroy().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    release();
    await running;
    await closing;
    expect(closed).toBe(true);
    expect(reconciliation.initialize).toHaveBeenCalledTimes(1);
  });
  it('U-26 기능이 꺼지면 timer와 부팅 tick을 시작하지 않는다', () => {
    config.enabled = false;
    const timer = jest.spyOn(global, 'setInterval');
    scheduler.onApplicationBootstrap();
    expect(timer).not.toHaveBeenCalled();
    expect(reconciliation.initialize).not.toHaveBeenCalled();
  });
});
