import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { JobsModule } from '@/jobs/jobs.module';
import { KnowledgeGraphMembershipBridge } from '@/jobs/knowledge-graph/knowledge-graph-membership-bridge';
import { KnowledgeGraphBackfillService } from '@/knowledge-graph/knowledge-graph-backfill.service';
import { KnowledgeGraphProjectionService } from '@/knowledge-graph/knowledge-graph-projection.service';
import { MembershipProjectionQueryService } from '@/organizations/membership-projection-query.service';

// 전용 PostgreSQL과 Redis에서 전체 Jobs composition과 종료를 검증한다.
describe('지식 그래프 비활성 Jobs 실행 경계', () => {
  let jobs: INestApplicationContext | undefined;
  const initialEnabled = process.env.KG_PROJECTION_ENABLED;

  beforeAll(() => {
    process.env.KG_PROJECTION_ENABLED = 'false';
  });

  afterAll(async () => {
    try {
      await jobs?.close();
    } finally {
      if (initialEnabled === undefined)
        delete process.env.KG_PROJECTION_ENABLED;
      else process.env.KG_PROJECTION_ENABLED = initialEnabled;
    }
  });

  it('그래프 기능을 끈 상태에서 공개 owner 조회와 bridge 의존성을 해결하고 부팅한다', async () => {
    expect(process.env.KG_PROJECTION_ENABLED).toBe('false');
    jobs = await NestFactory.createApplicationContext(JobsModule, {
      abortOnError: false,
      logger: false,
    });
    expect(jobs.get(KnowledgeGraphMembershipBridge)).toBeInstanceOf(
      KnowledgeGraphMembershipBridge,
    );
    expect(jobs.get(MembershipProjectionQueryService)).toBeInstanceOf(
      MembershipProjectionQueryService,
    );
    expect(jobs.get(KnowledgeGraphBackfillService)).toBeInstanceOf(
      KnowledgeGraphBackfillService,
    );
    await expect(
      jobs.get(KnowledgeGraphProjectionService).applySourceEvent({}),
    ).rejects.toThrow('비활성화');
  });
});
