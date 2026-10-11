import { Injectable } from '@nestjs/common';

import { MeetingProjectionQueryService } from '@/calendar/meeting-projection-query.service';
import { GraphSourceDirectoryProvider } from '@/knowledge-graph/infrastructure/source-directory/graph-source-directory.provider';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';
import { ProjectProjectionQueryService } from '@/projects/project-projection-query.service';
import { TicketProjectionQueryService } from '@/projects/ticket-projection-query.service';
import { WikiProjectionQueryService } from '@/wiki/wiki-projection-query.service';

const PAGE_SIZE = 100;

@Injectable()
export class TeamspaceGraphSourceDirectoryAdapter extends GraphSourceDirectoryProvider {
  constructor(
    private readonly wiki: WikiProjectionQueryService,
    private readonly projects: ProjectProjectionQueryService,
    private readonly tickets: TicketProjectionQueryService,
    private readonly meetings: MeetingProjectionQueryService,
    private readonly organizations: OrganizationsService,
  ) {
    super();
  }

  async listMembers(
    actor: OrganizationActorContext,
    organizationId: string,
    query: Parameters<GraphSourceDirectoryProvider['listMembers']>[2],
  ) {
    const members = await this.allMembers(actor, organizationId, query.q);
    return members
      .map((member) => ({ userId: member.userId, title: member.user.name }))
      .sort(
        (left, right) =>
          left.title.localeCompare(right.title) ||
          left.userId.localeCompare(right.userId),
      )
      .filter(
        (member) =>
          !query.after ||
          member.title > query.after.title ||
          (member.title === query.after.title &&
            member.userId > query.after.userId),
      )
      .slice(0, query.limit);
  }

  async countMembers(
    actor: OrganizationActorContext,
    organizationId: string,
    q?: string | null,
  ) {
    const first = await this.organizations.listMembers(actor, organizationId, {
      limit: 1,
      offset: 0,
      ...(q ? { search: q } : {}),
    });
    return first.total;
  }

  async countOwnerSources(
    organizationId: string,
    kind: Parameters<GraphSourceDirectoryProvider['countOwnerSources']>[1],
    q?: string | null,
  ) {
    let count = 0;
    let after: { title: string; id: string } | null = null;
    while (true) {
      const page = await this.ownerPage(organizationId, kind, {
        q: q ?? null,
        after,
        limit: PAGE_SIZE,
      });
      count += page.length;
      if (page.length < PAGE_SIZE) return count;
      const last = page[page.length - 1]!;
      after = { title: this.ownerTitle(kind, last), id: last.id };
    }
  }

  private async allMembers(
    actor: OrganizationActorContext,
    organizationId: string,
    q?: string | null,
  ) {
    const first = await this.organizations.listMembers(actor, organizationId, {
      limit: 100,
      offset: 0,
      ...(q ? { search: q } : {}),
    });
    const items = [...first.items];
    for (let offset = first.items.length; offset < first.total; offset += 100) {
      const page = await this.organizations.listMembers(actor, organizationId, {
        limit: 100,
        offset,
        ...(q ? { search: q } : {}),
      });
      items.push(...page.items);
    }
    return items;
  }

  private ownerPage(
    organizationId: string,
    kind: Parameters<GraphSourceDirectoryProvider['countOwnerSources']>[1],
    query: {
      q: string | null;
      after: { title: string; id: string } | null;
      limit: number;
    },
  ) {
    switch (kind) {
      case 'wiki_document':
        return this.wiki.listForGraph(organizationId, query);
      case 'project':
        return this.projects.listForGraph(organizationId, query);
      case 'ticket':
        return this.tickets.listForGraph(organizationId, query);
      case 'meeting':
        return this.meetings.listForGraph(organizationId, query);
    }
  }

  private ownerTitle(
    kind: Parameters<GraphSourceDirectoryProvider['countOwnerSources']>[1],
    row: Awaited<
      ReturnType<TeamspaceGraphSourceDirectoryAdapter['ownerPage']>
    >[number],
  ) {
    if (kind === 'project' && 'name' in row) return row.name;
    return 'title' in row ? row.title : '';
  }
}
