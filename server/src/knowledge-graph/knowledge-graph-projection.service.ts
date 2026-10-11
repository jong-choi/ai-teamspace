import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { digestGraphJson } from '@/knowledge-graph/domain/graph-json-digest';
import { KnowledgeGraphWriter } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-writer.provider';
import { ProjectionDeliveryRepository } from '@/knowledge-graph/infrastructure/persistence/projection-delivery.repository';
import { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import { TeamspaceSourceProvider } from '@/knowledge-graph/infrastructure/source/teamspace-source.provider';

@Injectable()
export class KnowledgeGraphProjectionService {
  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
    private readonly sourceState: ProjectionStateRepository,
    private readonly sources: TeamspaceSourceProvider,
    private readonly writer: KnowledgeGraphWriter,
    private readonly delivery: ProjectionDeliveryRepository,
  ) {}

  async applySourceEvent(raw: unknown): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('지식 그래프 투영이 비활성화되어 있습니다.');
    }

    const event = this.sourceState.parseEvent(raw);
    if (
      event.aggregateKind !== 'wiki_document' &&
      event.aggregateKind !== 'project' &&
      event.aggregateKind !== 'ticket_label' &&
      event.aggregateKind !== 'ticket' &&
      event.aggregateKind !== 'meeting' &&
      event.aggregateKind !== 'meeting_room' &&
      event.aggregateKind !== 'meeting_recurrence' &&
      event.aggregateKind !== 'membership' &&
      event.aggregateKind !== 'curated_node' &&
      event.aggregateKind !== 'curated_edge'
    ) {
      throw new Error('지원하지 않는 그래프 원본 유형입니다.');
    }

    const source = await this.sourceState.current(
      event.organizationId,
      event.aggregateKind,
      event.aggregateId,
    );
    if (!source) {
      throw new Error('그래프 원본의 변경 버전이 존재하지 않습니다.');
    }
    if (source.desiredSeq < event.sourceVersion) {
      throw new Error('그래프 이벤트가 PostgreSQL 버전보다 앞서 있습니다.');
    }
    if (
      source.appliedSeq >= source.desiredSeq ||
      source.projectionStatus === 'failed'
    ) {
      return;
    }

    await this.sourceState.markApplying(
      source.organizationId,
      source.aggregateKind,
      source.aggregateId,
      source.desiredSeq,
    );

    let snapshotDigest = digestGraphJson(null);
    try {
      // 오래된 이벤트 payload 대신 현재 업무 owner의 확정 데이터만 조회한다.
      if (source.aggregateKind === 'wiki_document') {
        const snapshot = await this.sources.wiki(
          source.organizationId,
          source.aggregateId,
        );
        await this.assertSnapshotPresence(source, snapshot);
        snapshotDigest = digestGraphJson(source.deleted ? null : snapshot);
        await this.applyCurrentSnapshot(source, () =>
          this.writer.applyWiki(source, snapshot),
        );
      } else if (source.aggregateKind === 'project') {
        const snapshot = await this.sources.project(
          source.organizationId,
          source.aggregateId,
        );
        await this.assertSnapshotPresence(source, snapshot);
        snapshotDigest = digestGraphJson(source.deleted ? null : snapshot);
        await this.applyCurrentSnapshot(source, () =>
          this.writer.applyProject(source, snapshot),
        );
      } else if (source.aggregateKind === 'ticket_label') {
        const snapshot = await this.sources.ticketLabel(
          source.organizationId,
          source.aggregateId,
        );
        await this.assertSnapshotPresence(source, snapshot);
        snapshotDigest = digestGraphJson(source.deleted ? null : snapshot);
        await this.applyCurrentSnapshot(source, () =>
          this.writer.applyTicketLabel(source, snapshot),
        );
      } else if (source.aggregateKind === 'ticket') {
        const snapshot = await this.sources.ticket(
          source.organizationId,
          source.aggregateId,
        );
        await this.assertSnapshotPresence(source, snapshot);
        snapshotDigest = digestGraphJson(source.deleted ? null : snapshot);
        await this.applyCurrentSnapshot(source, () =>
          this.writer.applyTicket(source, snapshot),
        );
      } else if (source.aggregateKind === 'meeting') {
        const snapshot = await this.sources.meeting(
          source.organizationId,
          source.aggregateId,
        );
        await this.assertSnapshotPresence(source, snapshot);
        snapshotDigest = digestGraphJson(source.deleted ? null : snapshot);
        await this.applyCurrentSnapshot(source, () =>
          this.writer.applyMeeting(source, snapshot),
        );
      } else if (source.aggregateKind === 'meeting_room') {
        const snapshot = await this.sources.meetingRoom(
          source.organizationId,
          source.aggregateId,
        );
        await this.assertSnapshotPresence(source, snapshot);
        snapshotDigest = digestGraphJson(source.deleted ? null : snapshot);
        await this.applyCurrentSnapshot(source, () =>
          this.writer.applyMeetingRoom(source, snapshot),
        );
      } else if (source.aggregateKind === 'meeting_recurrence') {
        const snapshot = await this.sources.meetingRecurrence(
          source.organizationId,
          source.aggregateId,
        );
        await this.assertSnapshotPresence(source, snapshot);
        snapshotDigest = digestGraphJson(source.deleted ? null : snapshot);
        await this.applyCurrentSnapshot(source, () =>
          this.writer.applyMeetingRecurrence(source, snapshot),
        );
      } else if (source.aggregateKind === 'membership') {
        const snapshot = await this.sources.membership(
          source.organizationId,
          source.aggregateId,
        );
        await this.assertSnapshotPresence(source, snapshot);
        snapshotDigest = digestGraphJson(source.deleted ? null : snapshot);
        await this.applyCurrentSnapshot(source, () =>
          this.writer.applyMembership(source, snapshot),
        );
      } else if (source.aggregateKind === 'curated_node') {
        const snapshot = await this.sources.curatedNode(
          source.organizationId,
          source.aggregateId,
        );
        await this.assertSnapshotPresence(source, snapshot);
        snapshotDigest = digestGraphJson(source.deleted ? null : snapshot);
        await this.applyCurrentSnapshot(source, () =>
          this.writer.applyCuratedNode(source, snapshot),
        );
      } else if (source.aggregateKind === 'curated_edge') {
        const snapshot = await this.sources.curatedEdge(
          source.organizationId,
          source.aggregateId,
        );
        await this.assertSnapshotPresence(source, snapshot);
        snapshotDigest = digestGraphJson(source.deleted ? null : snapshot);
        await this.applyCurrentSnapshot(source, () =>
          this.writer.applyCuratedEdge(source, snapshot),
        );
      } else {
        throw new Error('PostgreSQL 원본 유형이 지원되지 않습니다.');
      }
    } catch (error) {
      await this.sourceState.markFailed(
        source.organizationId,
        source.aggregateKind,
        source.aggregateId,
        source.desiredSeq,
      );
      throw error;
    }

    // 원본의 최신 desiredSeq와 일치하는 경우에만 적용 버전을 갱신한다.
    await this.sourceState.markApplied(
      source.organizationId,
      source.aggregateKind,
      source.aggregateId,
      source.desiredSeq,
      snapshotDigest,
    );
  }

  async markTerminalFailure(raw: unknown): Promise<void> {
    const event = this.sourceState.parseEvent(raw);
    const source = await this.sourceState.current(
      event.organizationId,
      event.aggregateKind,
      event.aggregateId,
    );
    if (
      !source ||
      source.appliedSeq >= source.desiredSeq ||
      source.desiredSeq !== event.sourceVersion
    )
      return;
    await this.sourceState.markTerminalFailed(
      source.organizationId,
      source.aggregateKind,
      source.aggregateId,
      source.desiredSeq,
    );
  }
  private async assertSnapshotPresence(
    source: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    snapshot: Parameters<typeof digestGraphJson>[0],
  ): Promise<void> {
    const deleted =
      snapshot === null ||
      ('deletedAt' in snapshot && snapshot.deletedAt !== null);
    if (source.deleted === deleted) return;
    await this.delivery.recordObservedDeletion(source, deleted);
    throw new Error('원본 상태가 변경되어 최신 버전으로 다시 처리해야 합니다.');
  }
  private async applyCurrentSnapshot(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    apply: () => Promise<void>,
  ): Promise<void> {
    const current = await this.sourceState.current(
      tracking.organizationId,
      tracking.aggregateKind,
      tracking.aggregateId,
    );
    if (
      !current ||
      current.desiredSeq !== tracking.desiredSeq ||
      current.deleted !== tracking.deleted
    ) {
      throw new Error(
        '원본 조회 중 그래프 버전이 변경되어 다시 처리해야 합니다.',
      );
    }
    await apply();
  }
}
