import { randomUUID } from 'node:crypto';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { LangchainNeo4jGraphAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-graph.adapter';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { OutboxAggregateVersionSchema } from '@/outbox/outbox-aggregate-event.schema';
import { TicketLabelProjectionSourceSchema } from '@/projects/domain/ticket-label-projection-source';
import { TicketProjectionSourceSchema } from '@/projects/domain/ticket-projection-source';

describeKnowledgeGraph('실제 Neo4j Ticket의 관계 교체와 source 소유권', () => {
  const organizationId = `kg-ticket-${randomUUID()}`;
  const otherOrganizationId = `${organizationId}-other`;
  const ticketId = randomUUID();
  const projectId = randomUUID();
  const columnId = randomUUID();
  const assigneeId = randomUUID();
  const reporterId = randomUUID();
  const labelId = randomUUID();
  const checklistId = randomUUID();
  const itemId = randomUUID();
  const key = JSON.stringify(['ticket', organizationId, ticketId]);
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
  let writer: LangchainNeo4jGraphAdapter;

  beforeAll(async () => {
    const config = knowledgeGraphConfig();
    if (!config.url || !config.username || !config.password)
      throw new Error('Neo4j 검증 설정이 없습니다.');
    graph = await createNeo4jGraph({
      url: config.url,
      username: config.username,
      password: config.password,
      database: config.database,
    });
    writer = new LangchainNeo4jGraphAdapter(config);
  });
  async function cleanup() {
    await graph.query(
      `MATCH (node)
      WHERE node.organizationId IN $organizations OR
        (node:KGProjectionSource AND any(prefix IN $prefixes WHERE node.key STARTS WITH prefix))
      DETACH DELETE node`,
      {
        organizations: [organizationId, otherOrganizationId],
        prefixes: [organizationId, otherOrganizationId].flatMap((id) =>
          ['ticket', 'ticket_label'].map((kind) => `["${kind}","${id}",`),
        ),
      },
    );
  }
  beforeEach(cleanup);
  afterAll(async () => {
    try {
      if (graph) await cleanup();
    } finally {
      await writer?.onApplicationShutdown();
      await graph?.close();
    }
  });

  function tracking(version: number, deleted = false, org = organizationId) {
    return OutboxAggregateVersionSchema.parse({
      organizationId: org,
      aggregateKind: 'ticket',
      aggregateId: ticketId,
      desiredSeq: version,
      appliedSeq: 0,
      deleted,
      projectionStatus: 'pending',
      lastAttemptedAt: null,
      appliedAt: null,
      lastError: null,
      appliedSnapshotDigest: null,
      lastRequeuedAt: null,
      requeueCount: 0,
      updatedAt: new Date(),
    });
  }
  function source(org = organizationId) {
    return TicketProjectionSourceSchema.parse({
      id: ticketId,
      organizationId: org,
      projectId,
      columnId,
      number: 1,
      title: '티켓',
      priority: 'medium',
      assigneeUserId: assigneeId,
      reporterUserId: reporterId,
      position: 0,
      dueAt: null,
      archivedAt: null,
      updatedAt: new Date(),
      labels: [{ id: labelId, projectId, name: '소비자 이름', color: 'blue' }],
      checklists: [
        {
          id: checklistId,
          title: '목록',
          position: 0,
          items: [
            {
              id: itemId,
              checklistId,
              title: '항목',
              completed: false,
              position: 0,
            },
          ],
        },
      ],
    });
  }

  it('column·담당자·라벨·체크리스트 교체에서 이전 source 관계를 정리한다', async () => {
    await writer.applyTicket(tracking(1), source());
    const current = source();
    current.columnId = randomUUID();
    current.assigneeUserId = null;
    current.labels = [];
    const nextChecklistId = randomUUID();
    current.checklists = [
      {
        id: nextChecklistId,
        title: '이동',
        position: 0,
        items: [
          {
            ...current.checklists[0].items[0],
            checklistId: nextChecklistId,
            completed: true,
          },
        ],
      },
    ];
    await writer.applyTicket(tracking(2), current);
    expect(
      await graph.query(
        `MATCH (:KGTeamspaceTicket {key: $key})-[relation]->(target)
      RETURN type(relation) AS kind, target.sourceId AS id ORDER BY kind`,
        { key },
      ),
    ).toEqual([
      { kind: 'KG_TICKET_CHECKLIST', id: nextChecklistId },
      { kind: 'KG_TICKET_COLUMN', id: current.columnId },
      { kind: 'KG_TICKET_PROJECT', id: projectId },
      { kind: 'KG_TICKET_REPORTER', id: reporterId },
    ]);
    expect(
      await graph.query(
        'MATCH (checklist:KGTeamspaceTicketChecklist {organizationId: $organizationId})-[:KG_CHECKLIST_ITEM]->(item) RETURN checklist.sourceId AS checklistId, item.checklistId AS ownerId, item.completed AS completed',
        { organizationId },
      ),
    ).toEqual([
      {
        checklistId: nextChecklistId,
        ownerId: nextChecklistId,
        completed: true,
      },
    ]);
    current.checklists = [];
    await writer.applyTicket(tracking(3), current);
    expect(
      await graph.query(
        'MATCH (:KGTeamspaceTicketChecklist {organizationId: $organizationId})-[relation:KG_CHECKLIST_ITEM]->() RETURN count(relation) AS count',
        { organizationId },
      ),
    ).toEqual([{ count: '0' }]);
    expect(
      await graph.query(
        'MATCH (item:KGTeamspaceTicketChecklistItem {organizationId: $organizationId, sourceId: $itemId}) RETURN item.deleted AS deleted',
        { organizationId, itemId },
      ),
    ).toEqual([{ deleted: true }]);
  });

  it('Ticket의 오래된 label snapshot은 Label owner의 최신 속성과 삭제를 덮지 않는다', async () => {
    const labelKey = JSON.stringify(['ticket_label', organizationId, labelId]);
    const labelTracking = {
      ...tracking(1),
      aggregateKind: 'ticket_label',
      aggregateId: labelId,
    };
    const label = TicketLabelProjectionSourceSchema.parse({
      id: labelId,
      organizationId,
      projectId,
      name: 'owner 최신 이름',
      color: 'red',
      updatedAt: new Date(),
    });
    await writer.applyTicketLabel(
      OutboxAggregateVersionSchema.parse(labelTracking),
      label,
    );
    await writer.applyTicket(tracking(1), source());
    expect(
      await graph.query(
        'MATCH (label:KGTeamspaceTicketLabel {key: $labelKey}) RETURN label.name AS name, label.color AS color, label.placeholder AS placeholder',
        { labelKey },
      ),
    ).toEqual([{ name: 'owner 최신 이름', color: 'red', placeholder: false }]);
    await writer.applyTicketLabel(
      OutboxAggregateVersionSchema.parse({
        ...labelTracking,
        desiredSeq: 2,
        deleted: true,
      }),
      null,
    );
    await writer.applyTicket(tracking(2), source());
    expect(
      await graph.query(
        'MATCH (label:KGTeamspaceTicketLabel {key: $labelKey}) RETURN label.deleted AS deleted',
        { labelKey },
      ),
    ).toEqual([{ deleted: true }]);
  });

  it('큰 Label·Checklist·Item 집합을 재투영해도 관계 수가 증가하지 않는다', async () => {
    const current = source();
    current.labels = Array.from({ length: 50 }, () => ({
      id: randomUUID(),
      projectId,
      name: '라벨',
      color: 'blue',
    }));
    current.checklists = Array.from({ length: 10 }, (_, position) => {
      const id = randomUUID();
      return {
        id,
        title: '목록',
        position,
        items: Array.from({ length: 10 }, (_, itemPosition) => ({
          id: randomUUID(),
          checklistId: id,
          title: '항목',
          completed: false,
          position: itemPosition,
        })),
      };
    });
    await writer.applyTicket(tracking(1), current);
    await writer.applyTicket(tracking(2), current);
    expect(
      await graph.query(
        'MATCH (:KGTeamspaceTicket {key: $key})-[relation:KG_TICKET_LABEL]->() RETURN count(relation) AS count',
        { key },
      ),
    ).toEqual([{ count: '50' }]);
    expect(
      await graph.query(
        'MATCH (:KGTeamspaceTicket {key: $key})-[:KG_TICKET_CHECKLIST]->()-[relation:KG_CHECKLIST_ITEM]->() RETURN count(relation) AS count',
        { key },
      ),
    ).toEqual([{ count: '100' }]);
  });

  it('병렬 버전과 삭제 후 stale replay는 최신 tombstone으로 수렴하고 타 owner 관계를 보존한다', async () => {
    await writer.applyTicket(tracking(1), source());
    await graph.query(
      'MATCH (ticket:KGTeamspaceTicket {key: $key}) CREATE (ticket)-[:KG_TEST_FOREIGN]->(:KGTestReference {organizationId: $organizationId})',
      { key, organizationId },
    );
    await Promise.all(
      Array.from({ length: 7 }, (_, index) =>
        writer.applyTicket(tracking(index + 2), {
          ...source(),
          title: `버전 ${index + 2}`,
        }),
      ),
    );
    expect(
      await graph.query(
        'MATCH (ticket:KGTeamspaceTicket {key: $key}) RETURN ticket.title AS title',
        { key },
      ),
    ).toEqual([{ title: '버전 8' }]);
    await writer.applyTicket(tracking(9, true), null);
    await writer.applyTicket(tracking(8), source());
    expect(
      await graph.query(
        'MATCH (ticket:KGTeamspaceTicket {key: $key})-[relation]->() RETURN ticket.deleted AS deleted, collect(type(relation)) AS relations',
        { key },
      ),
    ).toEqual([{ deleted: true, relations: ['KG_TEST_FOREIGN'] }]);
    expect(
      await graph.query(
        'MATCH (:KGTeamspaceTicketChecklist {organizationId: $organizationId})-[relation:KG_CHECKLIST_ITEM]->() RETURN count(relation) AS count',
        { organizationId },
      ),
    ).toEqual([{ count: '0' }]);
  });

  it('동일한 식별자를 가진 두 조직의 Ticket은 삭제와 replay에서 분리된다', async () => {
    await writer.applyTicket(tracking(1), source());
    await writer.applyTicket(
      tracking(1, false, otherOrganizationId),
      source(otherOrganizationId),
    );
    await writer.applyTicket(tracking(2, true), null);
    expect(
      await graph.query(
        'MATCH (ticket:KGTeamspaceTicket {sourceId: $ticketId}) RETURN ticket.organizationId AS organizationId, ticket.deleted AS deleted ORDER BY organizationId',
        { ticketId },
      ),
    ).toEqual([
      { organizationId, deleted: true },
      { organizationId: otherOrganizationId, deleted: false },
    ]);
    expect(
      await graph.query(
        'MATCH (ticket:KGTeamspaceTicket {key: $otherKey})-[:KG_TICKET_LABEL]->(label) RETURN label.organizationId AS organizationId',
        { otherKey: JSON.stringify(['ticket', otherOrganizationId, ticketId]) },
      ),
    ).toEqual([{ organizationId: otherOrganizationId }]);
  });

  it('잘못된 조직·원본 ID·교차 project label·checklist item 원본은 쓰기 전에 거부한다', async () => {
    const wrongLabel = source();
    wrongLabel.labels[0].projectId = randomUUID();
    const wrongItem = source();
    wrongItem.checklists[0].items[0].checklistId = randomUUID();
    for (const invalid of [
      source(otherOrganizationId),
      { ...source(), id: randomUUID() },
      wrongLabel,
      wrongItem,
    ]) {
      await expect(writer.applyTicket(tracking(1), invalid)).rejects.toThrow(
        '일치하지 않습니다',
      );
    }
    expect(
      await graph.query(
        'MATCH (ticket:KGTeamspaceTicket {key: $key}) RETURN count(ticket) AS count',
        { key },
      ),
    ).toEqual([{ count: '0' }]);
  });
});
