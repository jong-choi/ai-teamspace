import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseService } from '@/database/database.service';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { graphRebuildRequest } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/graph-rebuild-request.schema';

import { eq, sql } from 'drizzle-orm';

const describeIsolated =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p8_a5'
    ? describe
    : describe.skip;

describeIsolated('R8-14 rebuild migration 0025', () => {
  const prefix = `kg-p8-a5-migration-${randomUUID().slice(0, 8)}`;
  const organizationId = `${prefix}-org`;
  const userId = `${prefix}-user`;
  let database: DatabaseService;

  beforeAll(() => {
    database = new DatabaseService(
      new ConfigService({ database: { url: process.env.DATABASE_URL } }),
    );
  });

  beforeEach(async () => {
    await database.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await database.db.delete(user).where(eq(user.id, userId));
    await database.db.insert(user).values({
      id: userId,
      name: userId,
      email: `${userId}@example.com`,
    });
    await database.db.insert(organization).values({
      id: organizationId,
      name: organizationId,
      slug: organizationId,
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await database.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await database.db.delete(user).where(eq(user.id, userId));
    await database.onApplicationShutdown();
  });

  it('0025 SQL은 rebuild-only이고 CHECK에 parameter placeholder가 없다', async () => {
    const migration = await readFile(
      `${process.cwd()}/drizzle/0025_sharp_jane_foster.sql`,
      'utf8',
    );
    expect(migration).toContain('CREATE TABLE "kg_graph_rebuild_request"');
    expect(migration).not.toContain('CREATE TABLE "kg_request_quota"');
    expect(migration).not.toContain('$1');
    expect(migration).toContain('9007199254740991');
    expect(migration).toContain('kg_graph_rebuild_request_active_unique');
  });

  it('실제 DB에 CHECK/FK/partial unique가 존재하고 single-flight 제약이 동작한다', async () => {
    const constraints = await database.db.execute<{
      conname: string;
      contype: string;
    }>(sql`
      select conname, contype
      from pg_constraint
      where conrelid = 'kg_graph_rebuild_request'::regclass
    `);
    const names = new Set(constraints.rows.map((row) => row.conname));
    for (const name of [
      'kg_graph_rebuild_request_mode_check',
      'kg_graph_rebuild_request_status_check',
      'kg_graph_rebuild_request_phase_check',
      'kg_graph_rebuild_request_lease_check',
      'kg_graph_rebuild_request_terminal_check',
      'kg_graph_rebuild_request_failed_code_check',
      'kg_graph_rebuild_request_cancel_check',
      'kg_graph_rebuild_request_counts_check',
      'kg_graph_rebuild_request_fingerprint_check',
      'kg_graph_rebuild_request_organization_id_organization_id_fk',
      'kg_graph_rebuild_request_requested_by_user_id_user_id_fk',
    ]) {
      expect(names).toContain(name);
    }

    const indexes = await database.db.execute<{ indexdef: string }>(sql`
      select indexdef
      from pg_indexes
      where tablename = 'kg_graph_rebuild_request'
        and indexname = 'kg_graph_rebuild_request_active_unique'
    `);
    expect(indexes.rows[0]?.indexdef).toContain('UNIQUE INDEX');
    expect(indexes.rows[0]?.indexdef).toContain('cancel_requested');

    await database.db.insert(graphRebuildRequest).values({
      organizationId,
      requestedByUserId: userId,
      mode: 'full',
      pipelineFingerprint: semanticPipelineFingerprint,
      phase: 'projection',
    });
    await expect(
      database.db.insert(graphRebuildRequest).values({
        organizationId,
        requestedByUserId: userId,
        mode: 'projection_repair',
        pipelineFingerprint: semanticPipelineFingerprint,
        phase: 'projection',
      }),
    ).rejects.toThrow();
  });

  it('requested user 삭제는 SET NULL, organization 삭제는 rebuild row CASCADE다', async () => {
    const [request] = await database.db
      .insert(graphRebuildRequest)
      .values({
        organizationId,
        requestedByUserId: userId,
        mode: 'full',
        pipelineFingerprint: semanticPipelineFingerprint,
        phase: 'projection',
      })
      .returning();

    await database.db.delete(user).where(eq(user.id, userId));
    expect(
      (
        await database.db
          .select()
          .from(graphRebuildRequest)
          .where(eq(graphRebuildRequest.id, request!.id))
      )[0]?.requestedByUserId,
    ).toBeNull();

    await database.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    expect(
      await database.db
        .select()
        .from(graphRebuildRequest)
        .where(eq(graphRebuildRequest.id, request!.id)),
    ).toHaveLength(0);
  });
});
