import type { MeetingProjectionSource } from '@/calendar/domain/meeting-projection-source';
import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';
import type { MeetingRoom } from '@/calendar/domain/meeting-room';
import type {
  CuratedEdge,
  CuratedNode,
} from '@/knowledge-graph/domain/curated-graph';
import type { OrganizationMembershipProjection } from '@/organizations/domain/organization-membership-projection';
import type { KnowledgeGraphAggregateKind } from '@/outbox/outbox-aggregate-change.publisher';
import type { ProjectProjectionSource } from '@/projects/domain/project-projection-source';
import type { TicketLabelProjectionSource } from '@/projects/domain/ticket-label-projection-source';
import type { TicketProjectionSource } from '@/projects/domain/ticket-projection-source';
import type { WikiProjectionSource } from '@/wiki/domain/wiki-projection-source';
export abstract class WorkosSourceProvider {
  abstract meetingRoom(
    organizationId: string,
    sourceId: string,
  ): Promise<MeetingRoom | null>;
  abstract meetingRecurrence(
    organizationId: string,
    sourceId: string,
  ): Promise<MeetingRecurrenceSeries | null>;
  abstract wiki(
    organizationId: string,
    sourceId: string,
  ): Promise<WikiProjectionSource | null>;
  abstract project(
    organizationId: string,
    sourceId: string,
  ): Promise<ProjectProjectionSource | null>;
  abstract ticketLabel(
    organizationId: string,
    sourceId: string,
  ): Promise<TicketLabelProjectionSource | null>;
  abstract ticket(
    organizationId: string,
    sourceId: string,
  ): Promise<TicketProjectionSource | null>;
  abstract meeting(
    organizationId: string,
    sourceId: string,
  ): Promise<MeetingProjectionSource | null>;
  abstract membership(
    organizationId: string,
    sourceId: string,
  ): Promise<OrganizationMembershipProjection | null>;
  abstract curatedNode(
    organizationId: string,
    sourceId: string,
  ): Promise<CuratedNode | null>;
  abstract curatedEdge(
    organizationId: string,
    sourceId: string,
  ): Promise<CuratedEdge | null>;
  abstract listIds(
    kind: KnowledgeGraphAggregateKind,
    organizationId: string,
    afterId: string | null,
    limit: number,
  ): Promise<
    (Pick<CuratedNode, 'id'> & Partial<Pick<CuratedNode, 'deletedAt'>>)[]
  >;
}
