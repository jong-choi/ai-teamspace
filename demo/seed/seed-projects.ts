import { z } from 'zod';

import { created, ignored } from '#seed/api.ts';
import type { SeedContext } from '#seed/context.ts';
import type { ProjectsFile } from '#seed/source.ts';

const columnList = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});

type DemoProject = ProjectsFile['projects'][number];
type DemoTicket = DemoProject['tickets'][number];

// 프로젝트 key로 만든 프로젝트 ID를 돌려준다. 회의가 프로젝트를 가리킬 때 쓴다.
export async function seedProjects(
  context: SeedContext,
  organizationId: string,
  file: ProjectsFile,
): Promise<Map<string, string>> {
  const projectIds = new Map<string, string>();
  for (const project of file.projects) {
    const base = `/organizations/${organizationId}/projects`;
    const creator = context.session(project.createdBy);
    const createdProject = await creator.post(
      base,
      {
        key: project.key,
        name: project.name,
        description: project.description,
        leadUserId: project.lead ? context.userId(project.lead) : undefined,
      },
      created,
    );
    const projectPath = `${base}/${createdProject.id}`;
    projectIds.set(project.key, createdProject.id);

    const columns = await creator.get(`${projectPath}/columns`, columnList);
    const columnIds = new Map(
      columns.items.map((item) => [item.name, item.id]),
    );
    const labelIds = new Map<string, string>();
    for (const label of project.labels) {
      const createdLabel = await creator.post(
        `${projectPath}/labels`,
        label,
        created,
      );
      labelIds.set(label.name, createdLabel.id);
    }

    // 티켓 번호가 만든 순서대로 붙으므로 작성 시각이 이른 것부터 넣는다.
    const ordered = project.tickets
      .map((ticket) => ({
        ticket,
        createdAt: context.past(
          ticket.createdAt,
          `${project.key} 티켓 "${ticket.title}"`,
        ),
      }))
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      );
    let lastActivity = ordered[0]?.createdAt ?? context.now;
    for (const { ticket, createdAt } of ordered) {
      const updatedAt = await seedTicket({
        columnIds,
        context,
        createdAt,
        labelIds,
        projectKey: project.key,
        projectPath,
        ticket,
      });
      if (updatedAt.getTime() > lastActivity.getTime())
        lastActivity = updatedAt;
    }
    if (ordered[0]) {
      context.backdates.push({
        kind: 'project',
        id: createdProject.id,
        createdAt: ordered[0].createdAt,
        updatedAt: lastActivity,
      });
    }
    console.log(
      `프로젝트 ${project.key}에 티켓 ${project.tickets.length}개를 넣었습니다.`,
    );
  }
  return projectIds;
}

// 티켓에서 마지막으로 일어난 일의 시각을 돌려준다.
async function seedTicket(input: {
  columnIds: ReadonlyMap<string, string>;
  context: SeedContext;
  createdAt: Date;
  labelIds: ReadonlyMap<string, string>;
  projectKey: string;
  projectPath: string;
  ticket: DemoTicket;
}): Promise<Date> {
  const { context, ticket } = input;
  const subject = `${input.projectKey} 티켓 "${ticket.title}"`;
  const columnId = input.columnIds.get(ticket.column);
  if (!columnId)
    throw new Error(`없는 컬럼입니다: ${subject} → ${ticket.column}`);

  const reporter = context.session(ticket.reporter);
  const createdTicket = await reporter.post(
    `${input.projectPath}/tickets`,
    {
      columnId,
      title: ticket.title,
      descriptionMarkdown: ticket.description ?? '',
      priority: ticket.priority,
      assigneeUserId: ticket.assignee
        ? context.userId(ticket.assignee)
        : undefined,
      dueAt: ticket.dueAt
        ? context.clock.resolve(ticket.dueAt).toISOString()
        : undefined,
    },
    created,
  );
  const ticketPath = `${input.projectPath}/tickets/${createdTicket.id}`;

  for (const labelName of ticket.labels) {
    const labelId = input.labelIds.get(labelName);
    if (!labelId) throw new Error(`없는 라벨입니다: ${subject} → ${labelName}`);
    await reporter.put(`${ticketPath}/labels/${labelId}`, undefined, ignored);
  }

  for (const checklist of ticket.checklists) {
    const createdChecklist = await reporter.post(
      `${ticketPath}/checklists`,
      { title: checklist.title },
      created,
    );
    const itemsPath = `${ticketPath}/checklists/${createdChecklist.id}/items`;
    for (const item of checklist.items) {
      const createdItem = await reporter.post(
        itemsPath,
        { title: item.title },
        created,
      );
      if (!item.completed) continue;
      await reporter.patch(
        `${itemsPath}/${createdItem.id}`,
        { completed: true },
        ignored,
      );
    }
  }

  const comments = ticket.comments
    .map((comment) => ({
      comment,
      at: context.past(comment.at, `${subject} 댓글`),
    }))
    .sort((left, right) => left.at.getTime() - right.at.getTime());
  let updatedAt = input.createdAt;
  for (const { comment, at } of comments) {
    if (at.getTime() < input.createdAt.getTime()) {
      throw new Error(`티켓보다 먼저 달린 댓글입니다: ${subject}`);
    }
    const createdComment = await context
      .session(comment.author)
      .post(
        `${ticketPath}/comments`,
        { contentMarkdown: comment.content },
        created,
      );
    context.backdates.push({
      kind: 'ticketComment',
      id: createdComment.id,
      at,
    });
    updatedAt = at;
  }
  context.backdates.push({
    kind: 'ticket',
    id: createdTicket.id,
    createdAt: input.createdAt,
    updatedAt,
  });
  return updatedAt;
}
