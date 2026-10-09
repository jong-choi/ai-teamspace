import { randomUUID } from 'node:crypto';

import type { TestingModuleBuilder } from '@nestjs/testing';

import { KnowledgeGraphUnavailableError } from '@/knowledge-graph/domain/graph-read.error';
import { GraphCompletenessService } from '@/knowledge-graph/graph-completeness.service';
import {
  curatedNodeId,
  sourceNodeId,
} from '@/knowledge-graph/graph-read-support';
import { KnowledgeGraphStructureReader } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-structure-reader.provider';
import { curatedEdge } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-edge.schema';
import { curatedNode } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-node.schema';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import { GraphSourceSnapshotProvider } from '@/knowledge-graph/infrastructure/source-snapshot/graph-source-snapshot.provider';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';

import {
  createRunPrefix,
  KnowledgeGraphHttpFixture,
} from '@test/knowledge-graph/support/knowledge-graph-http.fixture';
import { eq } from 'drizzle-orm';

const emptyStructureReader = {
  expand: async () => ({ nodes: [], edges: [], truncated: false }),
  semanticEntities: async () => [],
  listSemanticEntities: async () => [],
  listStructuralEdges: async () => [],
  nodeDetail: async () => null,
  edgeDetail: async () => null,
};

describeKnowledgeGraph(
  'H8-09·11·13·16·17 및 F8-03 지식 그래프 조회 HTTP E2E',
  () => {
    jest.setTimeout(120_000);

    const prefix = createRunPrefix('a2-query');
    let fixture: KnowledgeGraphHttpFixture;
    let owner: Awaited<ReturnType<KnowledgeGraphHttpFixture['createUser']>>;
    let member: Awaited<ReturnType<KnowledgeGraphHttpFixture['createUser']>>;
    let organizationId: string;
    let otherOrganizationId: string;
    // 조회 API는 기능 플래그가 켜진 경우에만 결선되므로 실행 셸 환경에 기대지 않고 명시한다.
    const originalQueryEnabled = process.env.KG_QUERY_ENABLED;

    beforeAll(async () => {
      process.env.KG_QUERY_ENABLED = 'true';
      fixture = await KnowledgeGraphHttpFixture.boot(prefix, (builder) =>
        builder
          .overrideProvider(KnowledgeGraphStructureReader)
          .useValue(emptyStructureReader)
          .overrideProvider(GraphCompletenessService)
          .useValue({
            forOrganization: async () => 'complete' as const,
          }),
      );
      owner = await fixture.createUser('owner');
      member = await fixture.createUser('member');
      organizationId = await fixture.createOrganization(owner, 'main');
      otherOrganizationId = await fixture.createOrganization(owner, 'other');
      await fixture.addMember(organizationId, member.userId, 'member');
    });

    afterAll(async () => {
      await fixture?.close();
      if (originalQueryEnabled === undefined)
        delete process.env.KG_QUERY_ENABLED;
      else process.env.KG_QUERY_ENABLED = originalQueryEnabled;
    });

    afterEach(() => jest.restoreAllMocks());

    it('H8-09 authoritative 상세는 원본 편집 경로를 가리키는 editTarget.owner를 반환한다', async () => {
      const document = await fixture.createWikiDocument(owner, organizationId, {
        title: 'H809 authoritative owner',
        contentMarkdown:
          '그래프 generic mutation이 아니라 원본 편집으로 연결한다.',
      });
      const nodeId = sourceNodeId('wiki_document', document.id);

      const response = await owner.agent
        .get(nodePath(organizationId, nodeId))
        .expect(200);

      expect(response.body).toMatchObject({
        id: nodeId,
        kind: 'wiki_document',
        editTarget: {
          kind: 'owner',
          ownerKind: 'wiki_document',
          sourceId: document.id,
        },
      });
    });

    it('F8-03 curated 저장 직후 explore는 pending이고 projection 반영 뒤 applied로 바뀐다', async () => {
      const created = await owner.agent
        .post(`/organizations/${organizationId}/knowledge-graph/curated/nodes`)
        .send({
          kind: 'custom',
          title: 'F803 projection 상태',
          properties: {},
        })
        .expect(201);
      const graphNodeId = curatedNodeId(created.body.id as string);

      const pending = await owner.agent
        .get(explorePath(organizationId))
        .query({
          focusKind: 'curated_node',
          focusId: graphNodeId,
          depth: 1,
          limit: 20,
        })
        .expect(200);
      expect(
        pending.body.nodes.find(
          (node: { id: string }) => node.id === graphNodeId,
        ),
      ).toMatchObject({
        projectionState: {
          status: 'pending',
          desiredSeq: created.body.revision,
          appliedSeq: 0,
        },
      });
      expect(pending.body.degradedReasons).toContain('projection_pending');

      await fixture.app
        .get(OutboxAggregateProjectionState)
        .markApplied(
          organizationId,
          'curated_node',
          created.body.id as string,
          created.body.revision as number,
          'a'.repeat(64),
        );

      const applied = await owner.agent
        .get(explorePath(organizationId))
        .query({
          focusKind: 'curated_node',
          focusId: graphNodeId,
          depth: 1,
          limit: 20,
        })
        .expect(200);
      expect(
        applied.body.nodes.find(
          (node: { id: string }) => node.id === graphNodeId,
        ),
      ).toMatchObject({
        projectionState: {
          status: 'applied',
          desiredSeq: created.body.revision,
          appliedSeq: created.body.revision,
        },
      });
      expect(applied.body.degradedReasons).not.toContain('projection_pending');
    });

    it('H8-11 cross-org는 0/404이고 curated 권한·revision editTarget을 현재 역할로 계산한다', async () => {
      const rawId = randomUUID();
      await seedCuratedNodes(organizationId, [
        {
          id: rawId,
          title: 'H811 조직 격리 노드',
          revision: 7,
        },
      ]);
      const nodeId = curatedNodeId(rawId);

      const ownerView = await owner.agent
        .get(nodePath(organizationId, nodeId))
        .expect(200);
      expect(ownerView.body).toMatchObject({
        id: nodeId,
        kind: 'curated_node',
        title: 'H811 조직 격리 노드',
        permissions: {
          canEdit: true,
          canDelete: true,
          canCorrect: false,
          canSuppress: false,
        },
        editTarget: {
          kind: 'curated_node',
          nodeId: rawId,
          revision: 7,
        },
      });

      const memberView = await member.agent
        .get(nodePath(organizationId, nodeId))
        .expect(200);
      expect(memberView.body).toMatchObject({
        id: nodeId,
        permissions: {
          canEdit: false,
          canDelete: false,
        },
        editTarget: {
          kind: 'none',
          reason: 'not_permitted',
        },
      });

      await owner.agent.get(nodePath(otherOrganizationId, nodeId)).expect(404);
      const foreignList = await owner.agent
        .get(nodesPath(otherOrganizationId))
        .query({
          kind: 'curated_node',
          q: 'H811 조직 격리 노드',
          limit: 20,
        })
        .expect(200);
      expect(foreignList.body).toMatchObject({
        items: [],
        totalCount: 0,
        countAccuracy: 'exact',
      });
    });

    it('H8-13 rename/delete/member leave 직후 stale owner를 반환하지 않는다', async () => {
      const document = await fixture.createWikiDocument(owner, organizationId, {
        title: 'H813 오래된 제목',
        contentMarkdown: '현재 PostgreSQL owner가 최종 권위 원본이다.',
      });
      const documentNodeId = sourceNodeId('wiki_document', document.id);

      const before = await owner.agent
        .get(nodePath(organizationId, documentNodeId))
        .expect(200);
      expect(before.body.title).toBe('H813 오래된 제목');

      await owner.agent
        .patch(`/organizations/${organizationId}/wiki/documents/${document.id}`)
        .send({ title: 'H813 새 제목' })
        .expect(200);

      const oldTitle = await owner.agent
        .get(nodesPath(organizationId))
        .query({
          kind: 'wiki_document',
          q: 'H813 오래된 제목',
          limit: 20,
        })
        .expect(200);
      expect(oldTitle.body).toMatchObject({
        items: [],
        totalCount: 0,
        countAccuracy: 'exact',
      });

      const renamed = await owner.agent
        .get(nodePath(organizationId, documentNodeId))
        .expect(200);
      expect(renamed.body.title).toBe('H813 새 제목');

      await owner.agent
        .delete(
          `/organizations/${organizationId}/wiki/documents/${document.id}`,
        )
        .expect(204);
      await owner.agent
        .get(nodePath(organizationId, documentNodeId))
        .expect(404);
      const deleted = await owner.agent
        .get(nodesPath(organizationId))
        .query({
          kind: 'wiki_document',
          q: 'H813 새 제목',
          limit: 20,
        })
        .expect(200);
      expect(deleted.body.items).toEqual([]);
      expect(deleted.body.totalCount).toBe(0);

      const memberNodeId = sourceNodeId('member', member.userId);
      await owner.agent.get(nodePath(organizationId, memberNodeId)).expect(200);
      const memberList = await owner.agent
        .get(`/organizations/${organizationId}/members`)
        .query({ limit: 100, offset: 0 })
        .expect(200);
      const membership = memberList.body.items.find(
        (row: { userId: string }) => row.userId === member.userId,
      );
      if (!membership) throw new Error('H8-13 membership fixture가 없습니다.');

      await owner.agent
        .delete(`/organizations/${organizationId}/members/${membership.id}`)
        .expect(204);
      await owner.agent.get(nodePath(organizationId, memberNodeId)).expect(404);
    });

    it('H8-16 kind/q/keyset cursor는 중복·누락 없이 순회하고 filter/org scope 재사용을 거부한다', async () => {
      const rows = Array.from({ length: 125 }, (_, index) => ({
        id: randomUUID(),
        title: `H816 검색 노드 ${index.toString().padStart(3, '0')}`,
        revision: 1,
      }));
      await seedCuratedNodes(organizationId, rows);

      const seen = new Set<string>();
      let cursor: string | undefined;
      let firstCursor: string | null = null;
      do {
        const response = await owner.agent
          .get(nodesPath(organizationId))
          .query({
            kind: 'curated_node',
            q: 'H816 검색 노드',
            limit: 50,
            ...(cursor ? { cursor } : {}),
          })
          .expect(200);

        expect(response.body.totalCount).toBe(125);
        expect(response.body.countAccuracy).toBe('exact');
        for (const item of response.body.items as { id: string }[]) {
          expect(seen.has(item.id)).toBe(false);
          seen.add(item.id);
        }
        firstCursor ??= response.body.nextCursor;
        cursor = response.body.nextCursor ?? undefined;
      } while (cursor);

      expect(seen.size).toBe(125);
      if (!firstCursor) throw new Error('H8-16 cursor가 생성되지 않았습니다.');

      const filterMismatch = await owner.agent
        .get(nodesPath(organizationId))
        .query({
          kind: 'curated_node',
          q: '다른 검색어',
          limit: 50,
          cursor: firstCursor,
        })
        .expect(400);
      expect(filterMismatch.body.errorCode).toBe('KG_CURSOR_SCOPE_MISMATCH');

      const organizationMismatch = await owner.agent
        .get(nodesPath(otherOrganizationId))
        .query({
          kind: 'curated_node',
          q: 'H816 검색 노드',
          limit: 50,
          cursor: firstCursor,
        })
        .expect(400);
      expect(organizationMismatch.body.errorCode).toBe(
        'KG_CURSOR_SCOPE_MISMATCH',
      );
    });

    it('H8-17 high-degree explore는 node/edge/bytes cap과 nextCursor를 지키고 oversized limit을 거부한다', async () => {
      const focusId = randomUUID();
      const neighbors = Array.from({ length: 120 }, (_, index) => ({
        id: randomUUID(),
        title: `H817 이웃 ${index.toString().padStart(3, '0')}`,
        revision: 1,
      }));
      await seedCuratedNodes(organizationId, [
        { id: focusId, title: 'H817 중심', revision: 1 },
        ...neighbors,
      ]);
      await fixture.database.insert(curatedEdge).values(
        neighbors.map((neighbor) => ({
          organizationId,
          sourceNodeId: focusId,
          targetNodeId: neighbor.id,
          predicate: 'related_to' as const,
          directed: true,
          createdByUserId: owner.userId,
          updatedByUserId: owner.userId,
        })),
      );

      await owner.agent
        .get(explorePath(organizationId))
        .query({
          focusKind: 'curated_node',
          focusId: curatedNodeId(focusId),
          depth: 2,
          limit: 101,
        })
        .expect(400);

      const response = await owner.agent
        .get(explorePath(organizationId))
        .query({
          focusKind: 'curated_node',
          focusId: curatedNodeId(focusId),
          depth: 2,
          limit: 100,
        })
        .expect(200);

      expect(response.body.nodes.length).toBeLessThanOrEqual(100);
      expect(response.body.edges.length).toBeLessThanOrEqual(300);
      expect(
        Buffer.byteLength(
          JSON.stringify({
            nodes: response.body.nodes,
            edges: response.body.edges,
          }),
        ),
      ).toBeLessThanOrEqual(256 * 1024);
      expect(response.body.truncated).toBe(true);
      expect(response.body.nextCursor).toEqual(expect.any(String));
    });

    it('H8-14 그래프 저장소 장애 시 explore는 503이고 위키 업무 쓰기는 계속 동작한다', async () => {
      const document = await fixture.createWikiDocument(owner, organizationId, {
        title: 'H814 탐색 기준 문서',
        contentMarkdown: '그래프 장애와 업무 저장 경계를 확인한다.',
      });
      jest
        .spyOn(
          fixture.app.get(KnowledgeGraphStructureReader, { strict: false }),
          'expand',
        )
        .mockRejectedValueOnce(new KnowledgeGraphUnavailableError());

      const unavailable = await owner.agent
        .get(explorePath(organizationId))
        .query({
          focusKind: 'wiki_document',
          focusId: sourceNodeId('wiki_document', document.id),
          depth: 1,
          limit: 20,
        })
        .expect(503);
      expect(unavailable.body.errorCode).toBe('KG_GRAPH_UNAVAILABLE');

      await owner.agent
        .post(`/organizations/${organizationId}/wiki/documents`)
        .send({ title: 'H814 장애 중 저장', contentMarkdown: '업무 PG는 정상' })
        .expect(201);
    });

    it('F8-08 1천 source의 표·explore·search 기준값을 측정하고 응답 상한을 지킨다', async () => {
      const first = await fixture.createWikiDocument(owner, organizationId, {
        title: 'F808 기준 문서 0000',
        contentMarkdown: 'F808 기준 검색 본문',
      });
      const [template] = await fixture.database
        .select()
        .from(wikiDocument)
        .where(eq(wikiDocument.id, first.id));
      if (!template) throw new Error('F8-08 Wiki template가 없습니다.');

      for (let offset = 1; offset < 1_000; offset += 200) {
        await fixture.database.insert(wikiDocument).values(
          Array.from({ length: Math.min(200, 1_000 - offset) }, (_, index) => ({
            ...template,
            id: randomUUID(),
            title: `F808 기준 문서 ${(offset + index).toString().padStart(4, '0')}`,
            position: offset + index,
          })),
        );
      }

      const expand = jest.spyOn(emptyStructureReader, 'expand');
      const tableStartedAt = performance.now();
      const table = await owner.agent
        .get(nodesPath(organizationId))
        .query({ kind: 'wiki_document', q: 'F808 기준 문서', limit: 100 })
        .expect(200);
      const tableMs = performance.now() - tableStartedAt;

      const exploreStartedAt = performance.now();
      const explore = await owner.agent
        .get(explorePath(organizationId))
        .query({
          focusKind: 'wiki_document',
          focusId: sourceNodeId('wiki_document', first.id),
          depth: 1,
          limit: 50,
        })
        .expect(200);
      const exploreMs = performance.now() - exploreStartedAt;

      const searchStartedAt = performance.now();
      const search = await owner.agent
        .get(`/organizations/${organizationId}/knowledge-graph/search`)
        .query({ q: 'F808 기준 검색', mode: 'keyword', limit: 5 })
        .expect(200);
      const searchMs = performance.now() - searchStartedAt;
      const responseBytes = Buffer.byteLength(
        JSON.stringify({
          table: table.body,
          explore: explore.body,
          search: search.body,
        }),
      );

      expect(table.body).toMatchObject({
        totalCount: 1_000,
        countAccuracy: 'exact',
      });
      expect(table.body.items).toHaveLength(100);
      expect(explore.body.nodes).toHaveLength(1);
      expect(search.body.items).toHaveLength(5);
      expect(expand).toHaveBeenCalledTimes(1);
      expect(responseBytes).toBeLessThanOrEqual(512 * 1024);
      expect(Math.max(tableMs, exploreMs, searchMs)).toBeLessThan(10_000);

      console.info(
        JSON.stringify({
          acceptance: 'F8-08',
          sources: 1_000,
          tableMs,
          exploreMs,
          searchMs,
          structureCalls: expand.mock.calls.length,
          responseBytes,
        }),
      );
    });

    it('F8-07 인가 장애·삭제 경합·탈퇴·API 재기동 뒤 비공개 원본을 노출하지 않는다', async () => {
      const restartPrefix = createRunPrefix('f807-restart');
      const configure = (builder: TestingModuleBuilder) =>
        builder
          .overrideProvider(KnowledgeGraphStructureReader)
          .useValue(emptyStructureReader)
          .overrideProvider(GraphCompletenessService)
          .useValue({ forOrganization: async () => 'complete' as const });
      const first = await KnowledgeGraphHttpFixture.boot(
        restartPrefix,
        configure,
      );
      let restarted: KnowledgeGraphHttpFixture | null = null;
      try {
        const restartOwner = await first.createUser('owner');
        const restartMember = await first.createUser('member');
        const restartOrganizationId = await first.createOrganization(
          restartOwner,
          'main',
        );
        await first.addMember(
          restartOrganizationId,
          restartMember.userId,
          'member',
        );
        const raced = await first.createWikiDocument(
          restartOwner,
          restartOrganizationId,
          {
            title: 'F807 삭제 경합 비공개 제목',
            contentMarkdown: '최종 DTO 전에 삭제되면 노출하지 않는다.',
          },
        );
        const racedNodeId = sourceNodeId('wiki_document', raced.id);
        const access = first.app.get(GraphSourceAccessProvider, {
          strict: false,
        });
        jest
          .spyOn(access, 'assertReadable')
          .mockRejectedValueOnce(new Error('authorization provider down'));
        const unavailable = await restartMember.agent.get(
          nodePath(restartOrganizationId, racedNodeId),
        );
        expect(unavailable.status).toBe(503);
        expect(unavailable.text).not.toContain('F807 삭제 경합 비공개 제목');

        const snapshots = first.app.get(GraphSourceSnapshotProvider, {
          strict: false,
        });
        const originalWikiForGraph = snapshots.wikiForGraph.bind(snapshots);
        let releaseSnapshot!: () => void;
        let reachedSnapshot!: () => void;
        const snapshotReleased = new Promise<void>((resolve) => {
          releaseSnapshot = resolve;
        });
        const snapshotReached = new Promise<void>((resolve) => {
          reachedSnapshot = resolve;
        });
        let held = false;
        jest
          .spyOn(snapshots, 'wikiForGraph')
          .mockImplementation(async (orgId, ids) => {
            const rows = await originalWikiForGraph(orgId, ids);
            if (!held && ids.includes(raced.id)) {
              held = true;
              reachedSnapshot();
              await snapshotReleased;
            }
            return rows;
          });

        const racedResponse = restartMember.agent
          .get(nodePath(restartOrganizationId, racedNodeId))
          .then((response) => response);
        await snapshotReached;
        await restartOwner.agent
          .delete(
            `/organizations/${restartOrganizationId}/wiki/documents/${raced.id}`,
          )
          .expect(204);
        releaseSnapshot();
        const hiddenAfterRace = await racedResponse;
        expect(hiddenAfterRace.status).toBe(404);
        expect(hiddenAfterRace.text).not.toContain(
          'F807 삭제 경합 비공개 제목',
        );
        jest.restoreAllMocks();

        const afterRestart = await first.createWikiDocument(
          restartOwner,
          restartOrganizationId,
          {
            title: 'F807 재기동 후 비공개 제목',
            contentMarkdown: '탈퇴한 사용자는 재기동 뒤에도 볼 수 없다.',
          },
        );
        const members = await restartOwner.agent
          .get(`/organizations/${restartOrganizationId}/members`)
          .query({ limit: 100, offset: 0 })
          .expect(200);
        const membership = members.body.items.find(
          (row: { userId: string }) => row.userId === restartMember.userId,
        );
        if (!membership) throw new Error('F8-07 member fixture가 없습니다.');
        await restartOwner.agent
          .delete(
            `/organizations/${restartOrganizationId}/members/${membership.id}`,
          )
          .expect(204);
        await first.shutdown();

        restarted = await KnowledgeGraphHttpFixture.boot(
          restartPrefix,
          configure,
        );
        const afterRestartResponse = await restarted
          .authenticated(restartMember.sessionCookie)
          .get(
            nodePath(
              restartOrganizationId,
              sourceNodeId('wiki_document', afterRestart.id),
            ),
          );
        expect(afterRestartResponse.status).toBe(404);
        expect(afterRestartResponse.text).not.toContain(
          'F807 재기동 후 비공개 제목',
        );
      } finally {
        jest.restoreAllMocks();
        if (restarted) await restarted.close();
        else await first.close();
      }
    });

    async function seedCuratedNodes(
      orgId: string,
      rows: readonly {
        id: string;
        title: string;
        revision: number;
      }[],
    ) {
      await fixture.database.insert(curatedNode).values(
        rows.map((row) => ({
          id: row.id,
          organizationId: orgId,
          kind: 'custom' as const,
          title: row.title,
          revision: row.revision,
          createdByUserId: owner.userId,
          updatedByUserId: owner.userId,
        })),
      );
    }

    function nodesPath(orgId: string) {
      return `/organizations/${orgId}/knowledge-graph/nodes`;
    }

    function nodePath(orgId: string, nodeId: string) {
      return `${nodesPath(orgId)}/${nodeId}`;
    }

    function explorePath(orgId: string) {
      return `/organizations/${orgId}/knowledge-graph/explore`;
    }
  },
);
