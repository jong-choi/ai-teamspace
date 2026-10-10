import { z } from 'zod';

import { ignored } from '#seed/api.ts';
import { applyBackdates } from '#seed/backdate.ts';
import { SeedContext } from '#seed/context.ts';
import { DemoClock, todayInSeoul } from '#seed/relative-time.ts';
import { seedCalendar } from '#seed/seed-calendar.ts';
import { seedChat } from '#seed/seed-chat.ts';
import { activateOrganization, seedIdentity } from '#seed/seed-identity.ts';
import {
  seedKnowledgeGraph,
  type KnowledgeGraphSeedTarget,
} from '#seed/seed-knowledge-graph.ts';
import { seedProjects } from '#seed/seed-projects.ts';
import { seedWiki } from '#seed/seed-wiki.ts';
import {
  readKnowledgeGraphSeed,
  readUsers,
  readWorkspace,
} from '#seed/source.ts';

const environment = z
  .object({
    DEMO_API_URL: z.url(),
    DEMO_DATABASE_URL: z.string().min(1),
    DEMO_NEO4J_URI: z.string().min(1),
    DEMO_NEO4J_USERNAME: z.string().min(1),
    DEMO_NEO4J_PASSWORD: z.string().min(1),
    DEMO_NEO4J_DATABASE: z.string().min(1).default('neo4j'),
    DEMO_PASSWORD: z.string().min(8),
    DEMO_BASE_DATE: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .parse({
    ...process.env,
    DEMO_BASE_DATE: process.env.DEMO_BASE_DATE || undefined,
  });

const now = new Date();
const baseDate = environment.DEMO_BASE_DATE ?? todayInSeoul(now);
const users = await readUsers();
// 넣기 전에 모든 파일을 읽어 형식 오류를 먼저 드러낸다.
const [workspaces, knowledgeGraph] = await Promise.all([
  Promise.all(
    users.organizations.map((organization) => readWorkspace(organization.slug)),
  ),
  readKnowledgeGraphSeed(),
]);

console.log(
  `기준일 ${baseDate}로 ${environment.DEMO_API_URL}에 데모 데이터를 넣습니다.`,
);
const clock = new DemoClock(baseDate);
const context = new SeedContext(clock, users.demoUsername, now);
const knowledgeGraphTargets: KnowledgeGraphSeedTarget[] = [];

await seedIdentity({
  apiUrl: environment.DEMO_API_URL,
  context,
  demoPassword: environment.DEMO_PASSWORD,
  file: users,
});

for (const workspace of workspaces) {
  const organizationId = context.organizationId(workspace.slug);
  const owner = users.users.find((user) =>
    user.memberships.some(
      (item) => item.organization === workspace.slug && item.role === 'owner',
    ),
  );
  if (!owner) throw new Error(`소유자가 없는 조직입니다: ${workspace.slug}`);

  await activateOrganization(context, users, workspace.slug);
  const projectIds = await seedProjects(
    context,
    organizationId,
    workspace.projects,
  );
  await seedCalendar({
    administratorUsername: owner.username,
    context,
    file: workspace.calendar,
    organizationId,
    projectIds,
  });
  const documentIds = await seedWiki(context, organizationId, workspace);
  for (const document of workspace.wiki.documents) {
    const documentId = documentIds.get(document.key);
    if (!documentId)
      throw new Error(`시드한 위키 문서 ID를 찾지 못했습니다: ${document.key}`);
    knowledgeGraphTargets.push({
      documentId,
      documentKey: document.key,
      organizationId,
      organizationSlug: workspace.slug,
    });
  }
  await seedChat(context, workspace.chat);
}

await applyBackdates(
  environment.DEMO_DATABASE_URL,
  context.backdates,
  clock.resolve({ workday: -60, time: '10:00' }),
);
console.log(`작성 시각 ${context.backdates.length}건을 과거로 옮겼습니다.`);

await seedKnowledgeGraph({
  databaseUrl: environment.DEMO_DATABASE_URL,
  graph: knowledgeGraph,
  neo4j: {
    database: environment.DEMO_NEO4J_DATABASE,
    password: environment.DEMO_NEO4J_PASSWORD,
    uri: environment.DEMO_NEO4J_URI,
    username: environment.DEMO_NEO4J_USERNAME,
  },
  targets: knowledgeGraphTargets,
});

// 읽은 위치는 메시지 시각으로 기록되므로 시각을 옮긴 뒤에 표시한다.
const demoSession = context.session(users.demoUsername);
for (const read of context.pendingReads) {
  await demoSession.post(
    `/chat/conversations/${read.conversationId}/read`,
    { messageId: read.messageId },
    ignored,
  );
}

// 조직 초대 알림은 이미 수락한 것이므로 읽은 것으로 둔다.
const conversations = await demoSession.get(
  '/chat/conversations',
  z.object({
    items: z.array(
      z.object({ id: z.string(), kind: z.string(), unreadCount: z.number() }),
    ),
  }),
);
for (const conversation of conversations.items) {
  if (conversation.kind !== 'system' || conversation.unreadCount === 0)
    continue;
  const page = await demoSession.get(
    `/chat/conversations/${conversation.id}/messages?limit=1`,
    z.object({ items: z.array(z.object({ id: z.string() })) }),
  );
  const latest = page.items.at(-1);
  if (!latest) continue;
  await demoSession.post(
    `/chat/conversations/${conversation.id}/read`,
    { messageId: latest.id },
    ignored,
  );
}

console.log('데모 데이터를 모두 넣었습니다.');
