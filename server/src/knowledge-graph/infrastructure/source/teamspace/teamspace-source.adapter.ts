import { Injectable } from '@nestjs/common';

import { MeetingProjectionQueryService } from '@/calendar/meeting-projection-query.service';
import { digestGraphJson } from '@/knowledge-graph/domain/graph-json-digest';
import { CuratedProjectionSourceRepository } from '@/knowledge-graph/infrastructure/persistence/curated-projection-source.repository';
import { TeamspaceSourceProvider } from '@/knowledge-graph/infrastructure/source/teamspace-source.provider';
import { MembershipProjectionQueryService } from '@/organizations/membership-projection-query.service';
import type { KnowledgeGraphAggregateKind } from '@/outbox/outbox-aggregate-change.publisher';
import { ProjectProjectionQueryService } from '@/projects/project-projection-query.service';
import { TicketLabelProjectionQueryService } from '@/projects/ticket-label-projection-query.service';
import { TicketProjectionQueryService } from '@/projects/ticket-projection-query.service';
import { WikiProjectionQueryService } from '@/wiki/wiki-projection-query.service';
@Injectable()
export class TeamspaceSourceAdapter extends TeamspaceSourceProvider {
  constructor(
    private readonly wikiQuery: WikiProjectionQueryService,
    private readonly projectQuery: ProjectProjectionQueryService,
    private readonly ticketLabelQuery: TicketLabelProjectionQueryService,
    private readonly ticketQuery: TicketProjectionQueryService,
    private readonly meetingQuery: MeetingProjectionQueryService,
    private readonly membershipQuery: MembershipProjectionQueryService,
    private readonly curatedQuery: CuratedProjectionSourceRepository,
  ) {
    super();
  }
  organizationIds(afterId: string | null, limit: number) {
    return this.membershipQuery.listOrganizationIds(afterId, limit);
  }
  existingOrganizationIds(ids: readonly string[]) {
    return this.membershipQuery.existingOrganizationIds(ids);
  }
  organizationExists(id: string) {
    return this.membershipQuery.organizationExists(id);
  }
  async observeMembershipSnapshot(organizationId: string, userId: string) {
    const snapshot = await this.membershipQuery.current(organizationId, userId);
    return {
      deleted: snapshot === null,
      snapshotDigest: digestGraphJson(snapshot),
    };
  }
  wiki(organizationId: string, sourceId: string) {
    return this.wikiQuery.current(organizationId, sourceId);
  }
  wikiSemantic(organizationId: string, sourceId: string) {
    return this.wikiQuery.currentSemantic(organizationId, sourceId);
  }
  project(organizationId: string, sourceId: string) {
    return this.projectQuery.current(organizationId, sourceId);
  }
  ticketLabel(organizationId: string, sourceId: string) {
    return this.ticketLabelQuery.current(organizationId, sourceId);
  }
  ticket(organizationId: string, sourceId: string) {
    return this.ticketQuery.current(organizationId, sourceId);
  }
  meeting(organizationId: string, sourceId: string) {
    return this.meetingQuery.current(organizationId, sourceId);
  }
  meetingRoom(organizationId: string, sourceId: string) {
    return this.meetingQuery.room(organizationId, sourceId);
  }
  meetingRecurrence(organizationId: string, sourceId: string) {
    return this.meetingQuery.recurrence(organizationId, sourceId);
  }
  membership(organizationId: string, sourceId: string) {
    return this.membershipQuery.current(organizationId, sourceId);
  }
  curatedNode(organizationId: string, sourceId: string) {
    return this.curatedQuery.node(organizationId, sourceId);
  }
  curatedEdge(organizationId: string, sourceId: string) {
    return this.curatedQuery.edge(organizationId, sourceId);
  }
  async listIds(
    kind: KnowledgeGraphAggregateKind,
    organizationId: string,
    afterId: string | null,
    limit: number,
  ) {
    switch (kind) {
      case 'wiki_document':
        return this.wikiQuery.listIds(organizationId, afterId, limit);
      case 'project':
        return this.projectQuery.listIds(organizationId, afterId, limit);
      case 'ticket_label':
        return this.ticketLabelQuery.listIds(organizationId, afterId, limit);
      case 'ticket':
        return this.ticketQuery.listIds(organizationId, afterId, limit);
      case 'meeting':
        return this.meetingQuery.listIds(organizationId, afterId, limit);
      case 'meeting_room':
        return this.meetingQuery.listRoomIds(organizationId, afterId, limit);
      case 'meeting_recurrence':
        return this.meetingQuery.listRecurrenceIds(
          organizationId,
          afterId,
          limit,
        );
      case 'membership':
        return (
          await this.membershipQuery.listUserIds(organizationId, afterId, limit)
        ).map((id) => ({ id }));
      case 'curated_node':
        return this.curatedQuery.listNodeIds(organizationId, afterId, limit);
      case 'curated_edge':
        return this.curatedQuery.listEdgeIds(organizationId, afterId, limit);
    }
  }
}
