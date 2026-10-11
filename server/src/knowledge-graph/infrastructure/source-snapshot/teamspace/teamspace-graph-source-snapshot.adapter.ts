import { Injectable } from '@nestjs/common';

import { MeetingProjectionQueryService } from '@/calendar/meeting-projection-query.service';
import { GraphSourceSnapshotProvider } from '@/knowledge-graph/infrastructure/source-snapshot/graph-source-snapshot.provider';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';
import { ProjectProjectionQueryService } from '@/projects/project-projection-query.service';
import { TicketProjectionQueryService } from '@/projects/ticket-projection-query.service';
import { WikiProjectionQueryService } from '@/wiki/wiki-projection-query.service';

@Injectable()
export class TeamspaceGraphSourceSnapshotAdapter extends GraphSourceSnapshotProvider {
  constructor(
    private readonly wiki: WikiProjectionQueryService,
    private readonly projects: ProjectProjectionQueryService,
    private readonly tickets: TicketProjectionQueryService,
    private readonly meetings: MeetingProjectionQueryService,
    private readonly organizations: OrganizationsService,
  ) {
    super();
  }

  wikiForGraph(organizationId: string, ids: readonly string[]) {
    return this.wiki.currentManyForGraph(organizationId, ids);
  }
  wikiSemantic(organizationId: string, ids: readonly string[]) {
    return this.wiki.currentSemanticMany(organizationId, ids);
  }
  wikiKeyword(organizationId: string, query: string, limit: number) {
    return this.wiki.keywordCandidates(organizationId, query, limit);
  }
  listWiki(
    organizationId: string,
    query: Parameters<WikiProjectionQueryService['listForGraph']>[1],
  ) {
    return this.wiki.listForGraph(organizationId, query);
  }
  projectsForGraph(organizationId: string, ids: readonly string[]) {
    return this.projects.currentManyForGraph(organizationId, ids);
  }
  listProjects(
    organizationId: string,
    query: Parameters<ProjectProjectionQueryService['listForGraph']>[1],
  ) {
    return this.projects.listForGraph(organizationId, query);
  }
  ticketsForGraph(organizationId: string, ids: readonly string[]) {
    return this.tickets.currentManyForGraph(organizationId, ids);
  }
  listTickets(
    organizationId: string,
    query: Parameters<TicketProjectionQueryService['listForGraph']>[1],
  ) {
    return this.tickets.listForGraph(organizationId, query);
  }
  meetingsForGraph(organizationId: string, ids: readonly string[]) {
    return this.meetings.currentManyForGraph(organizationId, ids);
  }
  listMeetings(
    organizationId: string,
    query: Parameters<MeetingProjectionQueryService['listForGraph']>[1],
  ) {
    return this.meetings.listForGraph(organizationId, query);
  }
  membersForGraph(
    actor: OrganizationActorContext,
    organizationId: string,
    userIds: readonly string[],
  ) {
    return this.organizations.listMembersByUserIds(
      actor,
      organizationId,
      userIds,
    );
  }
}
