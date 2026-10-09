import type { MeetingGraphSource } from '@/calendar/domain/meeting-graph-source';
import type { MeetingGraphPageQuery } from '@/calendar/domain/meeting-graph-source';
import type { OrganizationMember } from '@/organizations/domain/organization-member';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import type {
  ProjectGraphPageQuery,
  ProjectGraphSource,
  TicketGraphSource,
} from '@/projects/domain/project-graph-source';
import type {
  WikiGraphPageQuery,
  WikiGraphSource,
  WikiKeywordCandidate,
  WikiSemanticGraphSource,
} from '@/wiki/domain/wiki-graph-source';

export abstract class GraphSourceSnapshotProvider {
  abstract wikiForGraph(
    organizationId: string,
    ids: readonly string[],
  ): Promise<WikiGraphSource[]>;
  abstract wikiSemantic(
    organizationId: string,
    ids: readonly string[],
  ): Promise<WikiSemanticGraphSource[]>;
  abstract wikiKeyword(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<WikiKeywordCandidate[]>;
  abstract listWiki(
    organizationId: string,
    query: WikiGraphPageQuery,
  ): Promise<WikiGraphSource[]>;
  abstract projectsForGraph(
    organizationId: string,
    ids: readonly string[],
  ): Promise<ProjectGraphSource[]>;
  abstract listProjects(
    organizationId: string,
    query: ProjectGraphPageQuery,
  ): Promise<ProjectGraphSource[]>;
  abstract ticketsForGraph(
    organizationId: string,
    ids: readonly string[],
  ): Promise<TicketGraphSource[]>;
  abstract listTickets(
    organizationId: string,
    query: ProjectGraphPageQuery,
  ): Promise<TicketGraphSource[]>;
  abstract meetingsForGraph(
    organizationId: string,
    ids: readonly string[],
  ): Promise<MeetingGraphSource[]>;
  abstract listMeetings(
    organizationId: string,
    query: MeetingGraphPageQuery,
  ): Promise<MeetingGraphSource[]>;
  abstract membersForGraph(
    actor: OrganizationActorContext,
    organizationId: string,
    userIds: readonly string[],
  ): Promise<OrganizationMember[]>;
}
