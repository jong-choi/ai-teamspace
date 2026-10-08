import { Test } from '@nestjs/testing';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { KnowledgeGraphWriter } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-writer.provider';
import { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';
import { KnowledgeGraphProjectionService } from '@/knowledge-graph/knowledge-graph-projection.service';
import { OutboxAggregateEventSchema } from '@/outbox/outbox-aggregate-event.schema';

describe('업무 그래프 투영 처리', () => {
  const tracking = {
    organizationId: 'org-one',
    aggregateKind: 'project',
    aggregateId: 'project-one',
    desiredSeq: 5,
    appliedSeq: 2,
    deleted: false,
    appliedAt: null,
    lastError: null,
    updatedAt: new Date('2026-10-08T00:00:00.000Z'),
  };
  const payload = {
    organizationId: tracking.organizationId,
    aggregateKind: tracking.aggregateKind,
    aggregateId: tracking.aggregateId,
    operation: 'changed',
    sourceVersion: 3,
    occurredAt: '2026-10-08T00:00:00.000Z',
  };
  const project = {
    id: tracking.aggregateId,
    organizationId: tracking.organizationId,
    key: 'KG',
    name: '자료',
    archivedAt: null,
    updatedAt: tracking.updatedAt,
  };

  const state = {
    parseEvent: jest.fn((raw: unknown) =>
      OutboxAggregateEventSchema.parse(raw),
    ),
    current: jest.fn(),
    markApplying: jest.fn(),
    markApplied: jest.fn(),
    markFailed: jest.fn(),
    markTerminalFailed: jest.fn(),
  };
  const wikiReader = { current: jest.fn() };
  const projectReader = { current: jest.fn() };
  const ticketLabelReader = { current: jest.fn() };
  const ticketReader = { current: jest.fn() };
  const meetingReader = { current: jest.fn() };
  const membershipReader = { current: jest.fn() };
  const curatedReader = { node: jest.fn(), edge: jest.fn() };
  const writer = {
    applyWiki: jest.fn(),
    applyProject: jest.fn(),
    applyTicketLabel: jest.fn(),
    applyTicket: jest.fn(),
    applyMeeting: jest.fn(),
    applyMembership: jest.fn(),
    applyCuratedNode: jest.fn(),
    applyCuratedEdge: jest.fn(),
  };
  const config = { enabled: true };

  let projection: KnowledgeGraphProjectionService;

  beforeEach(async () => {
    jest.resetAllMocks();
    config.enabled = true;
    state.parseEvent.mockImplementation((raw: unknown) =>
      OutboxAggregateEventSchema.parse(raw),
    );
    state.current.mockResolvedValue({ ...tracking });
    state.markApplying.mockResolvedValue(undefined);
    state.markApplied.mockResolvedValue(undefined);
    state.markFailed.mockResolvedValue(undefined);
    projectReader.current.mockResolvedValue(project);
    writer.applyWiki.mockResolvedValue(undefined);
    writer.applyProject.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        KnowledgeGraphProjectionService,
        { provide: knowledgeGraphConfig.KEY, useValue: config },
        { provide: ProjectionStateRepository, useValue: state },
        {
          provide: WorkosSourceProvider,
          useValue: {
            wiki: wikiReader.current,
            project: projectReader.current,
            ticketLabel: ticketLabelReader.current,
            ticket: ticketReader.current,
            meeting: meetingReader.current,
            membership: membershipReader.current,
            curatedNode: curatedReader.node,
            curatedEdge: curatedReader.edge,
          },
        },
        { provide: KnowledgeGraphWriter, useValue: writer },
      ],
    }).compile();
    projection = moduleRef.get(KnowledgeGraphProjectionService);
  });

  it('이벤트보다 최신 PostgreSQL 상태로 프로젝트를 투영한다', async () => {
    await projection.applySourceEvent(payload);

    expect(state.current).toHaveBeenCalledWith(
      'org-one',
      'project',
      'project-one',
    );
    expect(projectReader.current).toHaveBeenCalledWith(
      'org-one',
      'project-one',
    );
    expect(writer.applyProject).toHaveBeenCalledWith(tracking, project);
    expect(state.markApplied).toHaveBeenCalledWith(
      'org-one',
      'project',
      'project-one',
      5,
    );
    expect(writer.applyWiki).not.toHaveBeenCalled();
  });

  it('이미 최신 버전을 반영한 중복 이벤트는 그래프를 다시 쓰지 않는다', async () => {
    state.current.mockResolvedValue({ ...tracking, appliedSeq: 5 });

    await projection.applySourceEvent(payload);

    expect(writer.applyProject).not.toHaveBeenCalled();
    expect(state.markApplied).not.toHaveBeenCalled();
  });

  it('원본에 없는 미래 버전 이벤트는 오류로 처리한다', async () => {
    await expect(
      projection.applySourceEvent({ ...payload, sourceVersion: 6 }),
    ).rejects.toThrow('PostgreSQL 버전보다 앞서');
    expect(writer.applyProject).not.toHaveBeenCalled();
  });

  it('Neo4j 쓰기가 실패하면 PostgreSQL에 적용 성공을 기록하지 않는다', async () => {
    writer.applyProject.mockRejectedValueOnce(new Error('연결 불가'));

    await expect(projection.applySourceEvent(payload)).rejects.toThrow(
      '연결 불가',
    );
    expect(state.markApplied).not.toHaveBeenCalled();
    expect(state.markFailed).toHaveBeenCalledWith(
      'org-one',
      'project',
      'project-one',
      5,
    );
  });

  it('업무 원본 유형이 허용 목록에 없으면 writer를 호출하지 않는다', async () => {
    await expect(
      projection.applySourceEvent({ ...payload, aggregateKind: 'unexpected' }),
    ).rejects.toThrow();
    expect(state.current).not.toHaveBeenCalled();
  });

  it('기능을 비활성화하면 Neo4j 연결 없이 처리 요청을 거부한다', async () => {
    config.enabled = false;

    await expect(projection.applySourceEvent(payload)).rejects.toThrow(
      '비활성화',
    );
    expect(writer.applyProject).not.toHaveBeenCalled();
  });

  it('Wiki 원본일 때에만 Wiki reader 및 writer를 사용한다', async () => {
    const wikiTracking = {
      ...tracking,
      aggregateKind: 'wiki_document',
      aggregateId: 'wiki-one',
    };
    const wiki = {
      id: 'wiki-one',
      organizationId: 'org-one',
      collectionId: 'collection-one',
      parentDocumentId: null,
      title: '문서',
      position: 0,
      updatedAt: tracking.updatedAt,
    };
    state.current.mockResolvedValue(wikiTracking);
    wikiReader.current.mockResolvedValue(wiki);

    await projection.applySourceEvent({
      ...payload,
      aggregateKind: 'wiki_document',
      aggregateId: 'wiki-one',
    });

    expect(writer.applyWiki).toHaveBeenCalledWith(wikiTracking, wiki);
    expect(writer.applyProject).not.toHaveBeenCalled();
  });
  it('원본 조회 중 새 버전이 저장되면 이전 버전으로 그래프를 쓰지 않는다', async () => {
    state.current
      .mockResolvedValueOnce(tracking)
      .mockResolvedValueOnce({ ...tracking, desiredSeq: 6 });
    await expect(projection.applySourceEvent(payload)).rejects.toThrow(
      '원본 조회 중 그래프 버전',
    );
    expect(writer.applyProject).not.toHaveBeenCalled();
    expect(state.markApplied).not.toHaveBeenCalled();
  });

  it('원본 조회 중 삭제되면 살아 있는 이전 snapshot을 쓰지 않는다', async () => {
    state.current
      .mockResolvedValueOnce(tracking)
      .mockResolvedValueOnce({ ...tracking, desiredSeq: 6, deleted: true });
    await expect(projection.applySourceEvent(payload)).rejects.toThrow(
      '원본 조회 중 그래프 버전',
    );
    expect(writer.applyProject).not.toHaveBeenCalled();
  });

  it('원본 읽기 실패는 적용 실패로 남기고 외부 쓰기를 실행하지 않는다', async () => {
    projectReader.current.mockRejectedValueOnce(new Error('원본 읽기 실패'));
    await expect(projection.applySourceEvent(payload)).rejects.toThrow(
      '원본 읽기 실패',
    );
    expect(writer.applyProject).not.toHaveBeenCalled();
    expect(state.markApplied).not.toHaveBeenCalled();
    expect(state.markFailed).toHaveBeenCalledWith(
      'org-one',
      'project',
      'project-one',
      5,
    );
  });

  it('Neo4j 성공 뒤 PG 확인 실패는 성공으로 숨기지 않고 재시도를 요청한다', async () => {
    state.markApplied.mockRejectedValueOnce(new Error('확인 저장 실패'));
    await expect(projection.applySourceEvent(payload)).rejects.toThrow(
      '확인 저장 실패',
    );
    expect(writer.applyProject).toHaveBeenCalledTimes(1);
  });

  it('없는 버전 행은 임의 버전으로 투영하지 않는다', async () => {
    state.current.mockResolvedValueOnce(null);
    await expect(projection.applySourceEvent(payload)).rejects.toThrow(
      '변경 버전이 존재하지',
    );
    expect(writer.applyProject).not.toHaveBeenCalled();
  });

  it('오래된 작업의 최종 실패로 최신 버전을 실패 처리하지 않는다', async () => {
    await projection.markTerminalFailure(payload);
    expect(state.markTerminalFailed).not.toHaveBeenCalled();
  });

  it('현재 버전의 최종 실패만 기록한다', async () => {
    await projection.markTerminalFailure({ ...payload, sourceVersion: 5 });
    expect(state.markTerminalFailed).toHaveBeenCalledWith(
      'org-one',
      'project',
      'project-one',
      5,
    );
  });

  it.each([
    ['ticket_label', ticketLabelReader.current, writer.applyTicketLabel],
    ['ticket', ticketReader.current, writer.applyTicket],
    ['meeting', meetingReader.current, writer.applyMeeting],
    ['membership', membershipReader.current, writer.applyMembership],
    ['curated_node', curatedReader.node, writer.applyCuratedNode],
    ['curated_edge', curatedReader.edge, writer.applyCuratedEdge],
  ])(
    '%s 삭제 원본은 해당 writer에 null과 최신 삭제 버전을 전달한다',
    async (kind, read, apply) => {
      const removed = { ...tracking, aggregateKind: kind, deleted: true };
      state.current.mockResolvedValue(removed);
      read.mockResolvedValueOnce(null);
      await projection.applySourceEvent({
        ...payload,
        aggregateKind: kind,
        operation: 'removed',
      });
      expect(apply).toHaveBeenCalledWith(removed, null);
      expect(writer.applyProject).not.toHaveBeenCalled();
      expect(state.markApplied).toHaveBeenCalledWith(
        'org-one',
        kind,
        'project-one',
        5,
      );
    },
  );
});
