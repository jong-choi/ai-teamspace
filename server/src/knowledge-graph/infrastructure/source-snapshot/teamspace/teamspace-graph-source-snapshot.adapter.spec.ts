import { TeamspaceGraphSourceSnapshotAdapter } from '@/knowledge-graph/infrastructure/source-snapshot/teamspace/teamspace-graph-source-snapshot.adapter';

describe('TeamspaceGraphSourceSnapshotAdapter', () => {
  const wiki = {
    currentManyForGraph: jest.fn(),
    currentSemanticMany: jest.fn(),
    keywordCandidates: jest.fn(),
    listForGraph: jest.fn(),
  };
  const projects = {
    currentManyForGraph: jest.fn(),
    listForGraph: jest.fn(),
  };
  const tickets = {
    currentManyForGraph: jest.fn(),
    listForGraph: jest.fn(),
  };
  const meetings = {
    currentManyForGraph: jest.fn(),
    listForGraph: jest.fn(),
  };
  const organizations = {
    listMembersByUserIds: jest.fn(),
  };

  const adapter = new TeamspaceGraphSourceSnapshotAdapter(
    wiki as never,
    projects as never,
    tickets as never,
    meetings as never,
    organizations as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Wiki graph·semantic·keyword·목록 조회를 Wiki owner capability에 그대로 위임한다', async () => {
    const ids = ['wiki-a', 'wiki-b'];
    const page = { limit: 10, after: { title: 'A', id: 'wiki-a' }, q: '검색' };
    const graphRows = [{ id: 'wiki-a' }];
    const semanticRows = [{ id: 'wiki-a', contentMarkdown: '본문' }];
    const keywordRows = [{ id: 'wiki-a', matchedIn: ['title'] }];
    const listRows = [{ id: 'wiki-b' }];
    wiki.currentManyForGraph.mockResolvedValue(graphRows);
    wiki.currentSemanticMany.mockResolvedValue(semanticRows);
    wiki.keywordCandidates.mockResolvedValue(keywordRows);
    wiki.listForGraph.mockResolvedValue(listRows);

    await expect(adapter.wikiForGraph('org-a', ids)).resolves.toBe(graphRows);
    await expect(adapter.wikiSemantic('org-a', ids)).resolves.toBe(
      semanticRows,
    );
    await expect(adapter.wikiKeyword('org-a', '검색', 7)).resolves.toBe(
      keywordRows,
    );
    await expect(adapter.listWiki('org-a', page)).resolves.toBe(listRows);

    expect(wiki.currentManyForGraph).toHaveBeenCalledWith('org-a', ids);
    expect(wiki.currentSemanticMany).toHaveBeenCalledWith('org-a', ids);
    expect(wiki.keywordCandidates).toHaveBeenCalledWith('org-a', '검색', 7);
    expect(wiki.listForGraph).toHaveBeenCalledWith('org-a', page);
  });

  it('Project graph·목록 조회를 Project owner capability에 그대로 위임한다', async () => {
    const ids = ['project-a'];
    const page = { limit: 5, after: null, q: null };
    const current = [{ id: 'project-a' }];
    const listed = [{ id: 'project-b' }];
    projects.currentManyForGraph.mockResolvedValue(current);
    projects.listForGraph.mockResolvedValue(listed);

    await expect(adapter.projectsForGraph('org-a', ids)).resolves.toBe(current);
    await expect(adapter.listProjects('org-a', page)).resolves.toBe(listed);

    expect(projects.currentManyForGraph).toHaveBeenCalledWith('org-a', ids);
    expect(projects.listForGraph).toHaveBeenCalledWith('org-a', page);
  });

  it('Ticket graph·목록 조회를 Ticket owner capability에 그대로 위임한다', async () => {
    const ids = ['ticket-a'];
    const page = { limit: 5, after: null, q: null };
    const current = [{ id: 'ticket-a' }];
    const listed = [{ id: 'ticket-b' }];
    tickets.currentManyForGraph.mockResolvedValue(current);
    tickets.listForGraph.mockResolvedValue(listed);

    await expect(adapter.ticketsForGraph('org-a', ids)).resolves.toBe(current);
    await expect(adapter.listTickets('org-a', page)).resolves.toBe(listed);

    expect(tickets.currentManyForGraph).toHaveBeenCalledWith('org-a', ids);
    expect(tickets.listForGraph).toHaveBeenCalledWith('org-a', page);
  });

  it('Meeting graph·목록 조회를 Meeting owner capability에 그대로 위임한다', async () => {
    const ids = ['meeting-a'];
    const page = { limit: 5, after: null, q: null };
    const current = [{ id: 'meeting-a' }];
    const listed = [{ id: 'meeting-b' }];
    meetings.currentManyForGraph.mockResolvedValue(current);
    meetings.listForGraph.mockResolvedValue(listed);

    await expect(adapter.meetingsForGraph('org-a', ids)).resolves.toBe(current);
    await expect(adapter.listMeetings('org-a', page)).resolves.toBe(listed);

    expect(meetings.currentManyForGraph).toHaveBeenCalledWith('org-a', ids);
    expect(meetings.listForGraph).toHaveBeenCalledWith('org-a', page);
  });

  it('member 조회는 현재 actor와 organizationId를 Organizations owner service에 전달한다', async () => {
    const actor = { userId: 'user-a' };
    const ids = ['user-a', 'user-b'];
    const members = [{ userId: 'user-a' }];
    organizations.listMembersByUserIds.mockResolvedValue(members);

    await expect(adapter.membersForGraph(actor, 'org-a', ids)).resolves.toBe(
      members,
    );

    expect(organizations.listMembersByUserIds).toHaveBeenCalledWith(
      actor,
      'org-a',
      ids,
    );
  });
});
