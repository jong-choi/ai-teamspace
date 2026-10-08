import type { MeetingProjectionSource } from '@/calendar/domain/meeting-projection-source';
import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';
import type { MeetingRoom } from '@/calendar/domain/meeting-room';
import type {
  CuratedEdge,
  CuratedNode,
} from '@/knowledge-graph/domain/curated-graph';
import type { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import type { OrganizationMembershipProjection } from '@/organizations/domain/organization-membership-projection';
import type { ProjectProjectionSource } from '@/projects/domain/project-projection-source';
import type { TicketLabelProjectionSource } from '@/projects/domain/ticket-label-projection-source';
import type { TicketProjectionSource } from '@/projects/domain/ticket-projection-source';
import type { WikiProjectionSource } from '@/wiki/domain/wiki-projection-source';

export abstract class KnowledgeGraphWriter {
  abstract applyMeetingRoom(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    source: MeetingRoom | null,
  ): Promise<void>;
  abstract applyMeetingRecurrence(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    source: MeetingRecurrenceSeries | null,
  ): Promise<void>;
  abstract applyWiki(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    source: WikiProjectionSource | null,
  ): Promise<void>;

  abstract applyProject(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    source: ProjectProjectionSource | null,
  ): Promise<void>;

  abstract applyTicketLabel(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    source: TicketLabelProjectionSource | null,
  ): Promise<void>;

  abstract applyTicket(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    source: TicketProjectionSource | null,
  ): Promise<void>;

  abstract applyMeeting(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    source: MeetingProjectionSource | null,
  ): Promise<void>;

  abstract applyMembership(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    source: OrganizationMembershipProjection | null,
  ): Promise<void>;

  abstract applyCuratedNode(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    source: CuratedNode | null,
  ): Promise<void>;

  abstract applyCuratedEdge(
    tracking: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    source: CuratedEdge | null,
  ): Promise<void>;
}
