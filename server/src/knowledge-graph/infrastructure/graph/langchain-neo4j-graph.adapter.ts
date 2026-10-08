import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import type { MeetingProjectionSource } from '@/calendar/domain/meeting-projection-source';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import {
  TOMBSTONE_CURATED_EDGE,
  TOMBSTONE_CURATED_NODE,
  UPSERT_CURATED_EDGE,
  UPSERT_CURATED_NODE,
} from '@/knowledge-graph/curated-projection-queries';
import type {
  CuratedEdge,
  CuratedNode,
} from '@/knowledge-graph/domain/curated-graph';
import { KnowledgeGraphWriter } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-writer.provider';
import type { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import {
  TOMBSTONE_MEETING,
  UPSERT_MEETING,
} from '@/knowledge-graph/meeting-projection-queries';
import {
  TOMBSTONE_MEMBERSHIP,
  UPSERT_MEMBERSHIP,
} from '@/knowledge-graph/membership-projection-queries';
import {
  TOMBSTONE_PROJECT,
  UPSERT_PROJECT,
} from '@/knowledge-graph/project-projection-queries';
import {
  TOMBSTONE_TICKET_LABEL,
  UPSERT_TICKET_LABEL,
} from '@/knowledge-graph/ticket-label-projection-queries';
import {
  TOMBSTONE_TICKET,
  UPSERT_TICKET,
} from '@/knowledge-graph/ticket-projection-queries';
import type { OrganizationMembershipProjection } from '@/organizations/domain/organization-membership-projection';
import type { ProjectProjectionSource } from '@/projects/domain/project-projection-source';
import type { TicketLabelProjectionSource } from '@/projects/domain/ticket-label-projection-source';
import type { TicketProjectionSource } from '@/projects/domain/ticket-projection-source';
import type { WikiProjectionSource } from '@/wiki/domain/wiki-projection-source';
const UPSERT_WIKI = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
MERGE (document:KGWorkOSWikiDocument {key: $sourceKey})
SET document.organizationId = $organizationId,
    document.sourceId = $sourceId,
    document.collectionId = $collectionId,
    document.title = $title,
    document.position = $position,
    document.sourceUpdatedAt = $sourceUpdatedAt,
    document.placeholder = false,
    document.deleted = false
WITH marker, document
OPTIONAL MATCH (document)-[previous:KG_WIKI_PARENT]->()
DELETE previous
WITH marker, document
FOREACH (ignored IN CASE WHEN $parentKey IS NULL THEN [] ELSE [1] END |
    MERGE (parent:KGWorkOSWikiDocument {key: $parentKey})
    ON CREATE SET parent.organizationId = $organizationId,
                  parent.sourceId = $parentId,
                  parent.placeholder = true,
                  parent.deleted = false
    MERGE (document)-[:KG_WIKI_PARENT]->(parent)
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = false
RETURN marker.appliedSeq AS appliedSeq
`;

const TOMBSTONE_WIKI = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
OPTIONAL MATCH (document:KGWorkOSWikiDocument {key: $sourceKey})
OPTIONAL MATCH (document)-[previous:KG_WIKI_PARENT]->()
DELETE previous
WITH marker, document
FOREACH (ignored IN CASE WHEN document IS NULL THEN [] ELSE [1] END |
    SET document.deleted = true, document.title = null
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = true
RETURN marker.appliedSeq AS appliedSeq
`;

function sourceKey(kind: string, organizationId: string, id: string): string {
  return JSON.stringify([kind, organizationId, id]);
}

function projectKey(organizationId: string, projectId: string): string {
  return sourceKey('project', organizationId, projectId);
}

function wikiKey(organizationId: string, documentId: string): string {
  return sourceKey('wiki_document', organizationId, documentId);
}

@Injectable()
export class LangchainNeo4jGraphAdapter
  extends KnowledgeGraphWriter
  implements OnApplicationShutdown
{
  private connection: ReturnType<typeof createNeo4jGraph> | null = null;

  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
  ) {
    super();
  }

  async applyWiki(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    wiki: WikiProjectionSource | null,
  ): Promise<void> {
    if (!tracking.deleted && !wiki) {
      throw new Error('삭제되지 않은 위키 원본을 조회할 수 없습니다.');
    }
    const graph = await this.getGraph();
    const sourceKey = wikiKey(tracking.organizationId, tracking.aggregateId);
    const parentKey = wiki?.parentDocumentId
      ? wikiKey(tracking.organizationId, wiki.parentDocumentId)
      : null;
    await graph.query(tracking.deleted ? TOMBSTONE_WIKI : UPSERT_WIKI, {
      sourceKey,
      sourceVersion: tracking.desiredSeq,
      organizationId: tracking.organizationId,
      sourceId: tracking.aggregateId,
      collectionId: wiki?.collectionId ?? null,
      title: wiki?.title ?? null,
      position: wiki?.position ?? null,
      sourceUpdatedAt: wiki?.updatedAt.toISOString() ?? null,
      parentKey,
      parentId: wiki?.parentDocumentId ?? null,
    });
  }

  async applyProject(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    project: ProjectProjectionSource | null,
  ): Promise<void> {
    if (!tracking.deleted && !project) {
      throw new Error('삭제되지 않은 프로젝트 원본을 조회할 수 없습니다.');
    }
    const graph = await this.getGraph();
    await graph.query(tracking.deleted ? TOMBSTONE_PROJECT : UPSERT_PROJECT, {
      sourceKey: projectKey(tracking.organizationId, tracking.aggregateId),
      sourceVersion: tracking.desiredSeq,
      organizationId: tracking.organizationId,
      sourceId: tracking.aggregateId,
      projectKey: project?.key ?? null,
      name: project?.name ?? null,
      archivedAt: project?.archivedAt?.toISOString() ?? null,
      sourceUpdatedAt: project?.updatedAt.toISOString() ?? null,
      columns: (project?.columns ?? []).map((column) => ({
        ...column,
        key: sourceKey('project_column', tracking.organizationId, column.id),
      })),
    });
  }

  async applyTicketLabel(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    label: TicketLabelProjectionSource | null,
  ): Promise<void> {
    if (!tracking.deleted && !label) {
      throw new Error('삭제되지 않은 ticket label 원본을 조회할 수 없습니다.');
    }
    const graph = await this.getGraph();
    await graph.query(
      tracking.deleted ? TOMBSTONE_TICKET_LABEL : UPSERT_TICKET_LABEL,
      {
        sourceKey: sourceKey(
          'ticket_label',
          tracking.organizationId,
          tracking.aggregateId,
        ),
        sourceVersion: tracking.desiredSeq,
        organizationId: tracking.organizationId,
        sourceId: tracking.aggregateId,
        projectId: label?.projectId ?? null,
        name: label?.name ?? null,
        color: label?.color ?? null,
        sourceUpdatedAt: label?.updatedAt.toISOString() ?? null,
      },
    );
  }

  async applyTicket(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    ticket: TicketProjectionSource | null,
  ): Promise<void> {
    if (!tracking.deleted && !ticket) {
      throw new Error('삭제되지 않은 티켓 원본을 조회할 수 없습니다.');
    }
    const graph = await this.getGraph();
    const organizationId = tracking.organizationId;
    await graph.query(tracking.deleted ? TOMBSTONE_TICKET : UPSERT_TICKET, {
      sourceKey: sourceKey('ticket', organizationId, tracking.aggregateId),
      sourceVersion: tracking.desiredSeq,
      organizationId,
      sourceId: tracking.aggregateId,
      projectId: ticket?.projectId ?? null,
      columnId: ticket?.columnId ?? null,
      projectKey: ticket ? projectKey(organizationId, ticket.projectId) : null,
      columnKey: ticket
        ? sourceKey('project_column', organizationId, ticket.columnId)
        : null,
      number: ticket?.number ?? null,
      title: ticket?.title ?? null,
      priority: ticket?.priority ?? null,
      position: ticket?.position ?? null,
      dueAt: ticket?.dueAt?.toISOString() ?? null,
      archivedAt: ticket?.archivedAt?.toISOString() ?? null,
      sourceUpdatedAt: ticket?.updatedAt.toISOString() ?? null,
      assigneeUserId: ticket?.assigneeUserId ?? null,
      assigneeKey: ticket?.assigneeUserId
        ? sourceKey('user_reference', organizationId, ticket.assigneeUserId)
        : null,
      reporterUserId: ticket?.reporterUserId ?? null,
      reporterKey: ticket
        ? sourceKey('user_reference', organizationId, ticket.reporterUserId)
        : null,
      labels: (ticket?.labels ?? []).map((label) => ({
        ...label,
        key: sourceKey('ticket_label', organizationId, label.id),
      })),
      checklists: (ticket?.checklists ?? []).map((checklist) => ({
        ...checklist,
        key: sourceKey('ticket_checklist', organizationId, checklist.id),
        items: checklist.items.map((item) => ({
          ...item,
          key: sourceKey('ticket_checklist_item', organizationId, item.id),
        })),
      })),
    });
  }

  async applyMeeting(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    meeting: MeetingProjectionSource | null,
  ): Promise<void> {
    if (!tracking.deleted && !meeting) {
      throw new Error('삭제되지 않은 회의 원본을 조회할 수 없습니다.');
    }
    const graph = await this.getGraph();
    const organizationId = tracking.organizationId;
    await graph.query(tracking.deleted ? TOMBSTONE_MEETING : UPSERT_MEETING, {
      sourceKey: sourceKey('meeting', organizationId, tracking.aggregateId),
      sourceVersion: tracking.desiredSeq,
      organizationId,
      sourceId: tracking.aggregateId,
      projectReference: meeting?.projectId ?? null,
      title: meeting?.title ?? null,
      category: meeting?.category ?? null,
      startAt: meeting?.startAt.toISOString() ?? null,
      endAt: meeting?.endAt.toISOString() ?? null,
      timeZone: meeting?.timeZone ?? null,
      locationType: meeting?.locationType ?? null,
      locationText: meeting?.locationText ?? null,
      reminderMinutes: meeting?.reminderMinutes ?? null,
      canceledAt: meeting?.canceledAt?.toISOString() ?? null,
      sourceUpdatedAt: meeting?.updatedAt.toISOString() ?? null,
      organizerUserId: meeting?.organizerUserId ?? null,
      organizerKey: meeting
        ? sourceKey('user_reference', organizationId, meeting.organizerUserId)
        : null,
      roomKey: meeting?.room
        ? sourceKey('meeting_room', organizationId, meeting.room.id)
        : null,
      roomId: meeting?.room?.id ?? null,
      recurrenceKey: meeting?.recurrence
        ? sourceKey('meeting_recurrence', organizationId, meeting.recurrence.id)
        : null,
      recurrenceId: meeting?.recurrence?.id ?? null,
      recurrenceFrequency: meeting?.recurrence?.frequency ?? null,
      recurrenceInterval: meeting?.recurrence?.interval ?? null,
      recurrenceCount: meeting?.recurrence?.count ?? null,
      recurrenceUntil: meeting?.recurrence?.until?.toISOString() ?? null,
      recurrenceTimeZone: meeting?.recurrence?.timeZone ?? null,
      attendees: (meeting?.attendees ?? []).map((attendee) => ({
        ...attendee,
        key: sourceKey('user_reference', organizationId, attendee.userId),
      })),
    });
  }

  async applyMembership(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    membership: OrganizationMembershipProjection | null,
  ): Promise<void> {
    if (!tracking.deleted && !membership) {
      throw new Error('삭제되지 않은 membership 원본을 조회할 수 없습니다.');
    }
    const graph = await this.getGraph();
    const organizationId = tracking.organizationId;
    const userId = tracking.aggregateId;
    await graph.query(
      tracking.deleted ? TOMBSTONE_MEMBERSHIP : UPSERT_MEMBERSHIP,
      {
        sourceKey: sourceKey('membership', organizationId, userId),
        sourceVersion: tracking.desiredSeq,
        organizationId,
        userId,
        role: membership?.role ?? null,
        createdAt: membership?.createdAt ?? null,
        organizationKey: sourceKey(
          'organization',
          organizationId,
          organizationId,
        ),
        userKey: sourceKey('user_reference', organizationId, userId),
      },
    );
  }

  async applyCuratedNode(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    node: CuratedNode | null,
  ): Promise<void> {
    if (!tracking.deleted && !node) {
      throw new Error('삭제되지 않은 curated node 원본을 조회할 수 없습니다.');
    }
    const graph = await this.getGraph();
    await graph.query(
      tracking.deleted ? TOMBSTONE_CURATED_NODE : UPSERT_CURATED_NODE,
      {
        sourceKey: sourceKey(
          'curated_node',
          tracking.organizationId,
          tracking.aggregateId,
        ),
        sourceVersion: tracking.desiredSeq,
        organizationId: tracking.organizationId,
        sourceId: tracking.aggregateId,
        kind: node?.kind ?? null,
        title: node?.title ?? null,
        propertiesJson: JSON.stringify(node?.properties ?? {}),
        revision: node?.revision ?? null,
      },
    );
  }

  async applyCuratedEdge(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    edge: CuratedEdge | null,
  ): Promise<void> {
    if (!tracking.deleted && !edge) {
      throw new Error('삭제되지 않은 curated edge 원본을 조회할 수 없습니다.');
    }
    const graph = await this.getGraph();
    const organizationId = tracking.organizationId;
    await graph.query(
      tracking.deleted ? TOMBSTONE_CURATED_EDGE : UPSERT_CURATED_EDGE,
      {
        sourceKey: sourceKey(
          'curated_edge',
          organizationId,
          tracking.aggregateId,
        ),
        sourceVersion: tracking.desiredSeq,
        organizationId,
        sourceId: tracking.aggregateId,
        sourceNodeId: edge?.sourceNodeId ?? null,
        targetNodeId: edge?.targetNodeId ?? null,
        sourceNodeKey: edge
          ? sourceKey('curated_node', organizationId, edge.sourceNodeId)
          : null,
        targetNodeKey: edge
          ? sourceKey('curated_node', organizationId, edge.targetNodeId)
          : null,
        predicate: edge?.predicate ?? null,
        directed: edge?.directed ?? null,
        propertiesJson: JSON.stringify(edge?.properties ?? {}),
        revision: edge?.revision ?? null,
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.connection) {
      const connection = this.connection;
      this.connection = null;
      await (await connection).close();
    }
  }

  private async getGraph() {
    const { url, username, password, database } = this.config;
    if (!url || !username || !password) {
      throw new Error('Neo4j 연결 설정이 없습니다.');
    }
    this.connection ??= (async () => {
      const graph = await createNeo4jGraph({
        url,
        username,
        password,
        database,
        timeoutMs: 20_000,
      });
      try {
        await graph.query(
          'CREATE CONSTRAINT kg_projection_source_key IF NOT EXISTS FOR (node:KGProjectionSource) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_workos_wiki_key IF NOT EXISTS FOR (node:KGWorkOSWikiDocument) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_workos_project_key IF NOT EXISTS FOR (node:KGWorkOSProject) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_workos_ticket_key IF NOT EXISTS FOR (node:KGWorkOSTicket) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_workos_meeting_key IF NOT EXISTS FOR (node:KGWorkOSMeeting) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_project_column_key IF NOT EXISTS FOR (node:KGWorkOSProjectColumn) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_ticket_label_key IF NOT EXISTS FOR (node:KGWorkOSTicketLabel) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_ticket_checklist_key IF NOT EXISTS FOR (node:KGWorkOSTicketChecklist) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_ticket_checklist_item_key IF NOT EXISTS FOR (node:KGWorkOSTicketChecklistItem) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_meeting_room_key IF NOT EXISTS FOR (node:KGWorkOSMeetingRoom) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_meeting_recurrence_key IF NOT EXISTS FOR (node:KGWorkOSMeetingRecurrence) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_membership_key IF NOT EXISTS FOR (node:KGWorkOSMembership) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_user_reference_key IF NOT EXISTS FOR (node:KGWorkOSUserReference) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_organization_key IF NOT EXISTS FOR (node:KGWorkOSOrganization) REQUIRE node.key IS UNIQUE',
        );
        await graph.query(
          'CREATE CONSTRAINT kg_curated_node_key IF NOT EXISTS FOR (node:KGCuratedNode) REQUIRE node.key IS UNIQUE',
        );
        return graph;
      } catch (error) {
        await graph.close();
        throw error;
      }
    })();
    try {
      return await this.connection;
    } catch (error) {
      this.connection = null;
      throw error;
    }
  }
}
