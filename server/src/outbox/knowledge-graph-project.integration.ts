import { ConfigModule } from '@nestjs/config';
import { OutboxRelay } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { ProjectDrizzlePersistenceModule } from '@/projects/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { ProjectRepository } from '@/projects/infrastructure/persistence/project.repository';
import { ProjectProjectionQueryModule } from '@/projects/project-projection-query.module';
import { ProjectProjectionQueryService } from '@/projects/project-projection-query.service';

import { eq } from 'drizzle-orm';

const organizationId = 'knowledge-graph-project-integration-org';
const actorId = 'knowledge-graph-project-integration-user';

describe('프로젝트 원본 변경과 지식 그래프 Outbox 통합', () => {
  let moduleRef: TestingModule;
  let db: DatabaseService['db'];
  let repository: ProjectRepository;
  let relay: OutboxRelay;
  let query: ProjectProjectionQueryService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
        ProjectDrizzlePersistenceModule,
        ProjectProjectionQueryModule,
      ],
    }).compile();
    await moduleRef.init();
    db = moduleRef.get(DatabaseService).db;
    repository = moduleRef.get(ProjectRepository);
    query = moduleRef.get(ProjectProjectionQueryService);
    relay = moduleRef.get(OutboxRelay);
  });

  beforeEach(async () => {
    await db
      .delete(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, organizationId));
    await db.delete(project).where(eq(project.organizationId, organizationId));
    await db.delete(organization).where(eq(organization.id, organizationId));
    await db.delete(user).where(eq(user.id, actorId));
    await db.insert(user).values({
      id: actorId,
      name: '프로젝트 그래프 테스트 사용자',
      email: 'knowledge-graph-project@example.com',
      username: 'knowledgegraphprojectuser',
    });
    await db.insert(organization).values({
      id: organizationId,
      name: '프로젝트 그래프 테스트 조직',
      slug: organizationId,
      createdAt: new Date('2026-10-08T00:00:00.000Z'),
    });
  });

  afterAll(async () => {
    if (db) {
      await db
        .delete(outboxAggregateVersion)
        .where(eq(outboxAggregateVersion.organizationId, organizationId));
      await db
        .delete(project)
        .where(eq(project.organizationId, organizationId));
      await db.delete(organization).where(eq(organization.id, organizationId));
      await db.delete(user).where(eq(user.id, actorId));
    }
    await moduleRef?.close();
  });

  it('프로젝트 생성·이름 변경·보관·복구에 원본별 순서가 유지된다', async () => {
    const pending = (await relay.stats()).pending;
    const created = await repository.createProjectWithDefaultColumns(
      organizationId,
      actorId,
      { key: 'KG', name: '그래프 프로젝트', description: '', leadUserId: null },
    );
    await repository.updateProject(organizationId, created.id, {
      name: '그래프 프로젝트 변경',
    });
    await repository.updateProject(organizationId, created.id, {
      archived: true,
    });
    await repository.updateProject(organizationId, created.id, {
      archived: false,
    });
    const [state] = await db
      .select()
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, organizationId));
    expect(state).toMatchObject({
      aggregateKind: 'project',
      aggregateId: created.id,
      deleted: false,
      desiredSeq: 4,
      appliedSeq: 0,
    });
    expect((await relay.stats()).pending).toBe(pending + 4);
  });

  it('변하지 않은 프로젝트 메타데이터 요청은 이벤트를 추가하지 않는다', async () => {
    const created = await repository.createProjectWithDefaultColumns(
      organizationId,
      actorId,
      { key: 'K2', name: '유지', description: '', leadUserId: null },
    );
    await repository.updateProject(organizationId, created.id, {
      name: created.name,
    });
    const [state] = await db
      .select()
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, organizationId));
    expect(state?.desiredSeq).toBe(1);
  });
  it('공개 투영 조회는 프로젝트와 column을 일관된 조직 범위로 반환한다', async () => {
    const created = await repository.createProjectWithDefaultColumns(
      organizationId,
      actorId,
      { key: 'READ', name: '원본 조회', description: '', leadUserId: null },
    );
    const source = await query.current(organizationId, created.id);
    expect(source).toMatchObject({
      id: created.id,
      organizationId,
      key: 'READ',
      name: '원본 조회',
      leadUserId: null,
    });
    expect(source?.columns.length).toBeGreaterThan(0);
    expect(await query.current('다른-조직', created.id)).toBeNull();
    expect(await query.listIds(organizationId, null, 1)).toEqual([
      { id: created.id },
    ]);
    expect(await query.listIds(organizationId, created.id, 1)).toEqual([]);
  });
});
