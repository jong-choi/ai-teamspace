import { openAsBlob } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { demoWeekdays } from '#seed/relative-time.ts';

// 데모 자료는 이 스크립트 폴더의 한 단계 위에 있다.
const dataDirectory = new URL('../', import.meta.url);

// 파일의 구조와 서로 가리키는 이름만 여기서 확인한다. 값의 규칙은 서버가 검증한다.
const username = z.string().min(1);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const relativeTime = z.union([
  z.strictObject({ day: z.number().int(), time: time.optional() }),
  z.strictObject({ workday: z.number().int(), time: time.optional() }),
  z.strictObject({
    week: z.number().int(),
    weekday: z.enum(demoWeekdays),
    time: time.optional(),
  }),
]);

const usersFile = z.strictObject({
  demoUsername: username,
  organizations: z.array(
    z.strictObject({ slug: z.string(), name: z.string() }),
  ),
  users: z.array(
    z.strictObject({
      name: z.string(),
      username,
      email: z.string(),
      avatar: z.string(),
      memberships: z
        .array(z.strictObject({ organization: z.string(), role: z.string() }))
        .min(1),
    }),
  ),
});

const ticket = z.strictObject({
  title: z.string(),
  description: z.string().optional(),
  column: z.string(),
  priority: z.string(),
  reporter: username,
  assignee: username.optional(),
  createdAt: relativeTime,
  dueAt: relativeTime.optional(),
  labels: z.array(z.string()).default([]),
  checklists: z
    .array(
      z.strictObject({
        title: z.string(),
        items: z.array(
          z.strictObject({ title: z.string(), completed: z.boolean() }),
        ),
      }),
    )
    .default([]),
  comments: z
    .array(
      z.strictObject({
        author: username,
        content: z.string(),
        at: relativeTime,
      }),
    )
    .default([]),
});

const projectsFile = z.strictObject({
  projects: z.array(
    z.strictObject({
      key: z.string(),
      name: z.string(),
      description: z.string(),
      createdBy: username,
      lead: username.optional(),
      labels: z
        .array(z.strictObject({ name: z.string(), color: z.string() }))
        .default([]),
      tickets: z.array(ticket),
    }),
  ),
});

const calendarFile = z.strictObject({
  rooms: z
    .array(
      z.strictObject({
        name: z.string(),
        capacity: z.number().int(),
        floor: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  meetings: z.array(
    z.strictObject({
      title: z.string(),
      category: z.string(),
      organizer: username,
      startAt: relativeTime,
      durationMinutes: z.number().int().positive(),
      locationType: z.string(),
      room: z.string().optional(),
      locationText: z.string().optional(),
      project: z.string().optional(),
      attendees: z.array(username).default([]),
      agenda: z.string().optional(),
      notes: z.string().optional(),
      rsvp: z.record(username, z.string()).default({}),
      // 매주 반복하는 회의다. startAt이 첫 회차이고 이 횟수만큼 이어진다.
      repeatWeeks: z.number().int().min(2).optional(),
    }),
  ),
});

const wikiFile = z.strictObject({
  documents: z.array(
    z.strictObject({
      key: z.string(),
      title: z.string(),
      // 같은 조직 폴더의 wiki/ 아래에 있는 Markdown 파일 이름이다.
      file: z.string().regex(/^[a-z0-9-]+\.md$/),
      parent: z.string().optional(),
      author: username,
      createdAt: relativeTime,
    }),
  ),
});

const semanticNodeType = z.enum([
  'Person',
  'Team',
  'Project',
  'Technology',
  'Concept',
  'Decision',
  'Task',
  'Event',
]);
const semanticRelationshipType = z.enum([
  'RELATED_TO',
  'PART_OF',
  'USES',
  'DEPENDS_ON',
  'RESPONSIBLE_FOR',
  'PARTICIPATES_IN',
  'DECIDES',
  'AFFECTS',
]);
const semanticNode = z.strictObject({
  id: z.string().trim().min(1).max(200),
  type: semanticNodeType,
});
const semanticRelationship = z.strictObject({
  sourceNodeId: z.string().trim().min(1).max(200),
  sourceNodeType: semanticNodeType,
  relationshipType: semanticRelationshipType,
  targetNodeId: z.string().trim().min(1).max(200),
  targetNodeType: semanticNodeType,
});
const knowledgeGraphExtractionsFile = z.array(
  z.strictObject({
    organization: z.string().min(1),
    document: z.string().min(1),
    nodes: z.array(semanticNode),
    relationships: z.array(semanticRelationship),
  }),
);
const knowledgeGraphEmbeddingsFile = z.array(
  z.strictObject({
    organization: z.string().min(1),
    document: z.string().min(1),
    chunkIndex: z.number().int().nonnegative(),
    text: z.string().min(1),
    vector: z.array(z.number()).length(768),
  }),
);
const knowledgeGraphManifestFile = z.strictObject({
  version: z.literal(1),
  pipelineFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  extractorFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  embedding: z.strictObject({
    model: z.literal('gemini-embedding-2'),
    dimensions: z.literal(768),
  }),
  chunker: z.strictObject({
    splitter: z.literal('langchain-recursive-markdown'),
    packageVersion: z.literal('1.0.2'),
    chunkSize: z.literal(2000),
    chunkOverlap: z.literal(200),
    normalization: z.literal('nfc-lf-trim-v1'),
  }),
});

const chatMessage = z.strictObject({
  from: username,
  text: z.string(),
  at: relativeTime,
});

const chatFile = z.strictObject({
  channels: z
    .array(
      z.strictObject({
        name: z.string(),
        topic: z.string().optional(),
        creator: username,
        participants: z.array(username),
        messages: z.array(chatMessage),
        // 데모 계정이 읽지 않은 것으로 남길 마지막 메시지 수다.
        unread: z.number().int().min(0).default(0),
      }),
    )
    .default([]),
  directs: z
    .array(
      z.strictObject({
        between: z.tuple([username, username]),
        messages: z.array(chatMessage).min(1),
        unread: z.number().int().min(0).default(0),
      }),
    )
    .default([]),
});

export type UsersFile = z.infer<typeof usersFile>;
export type ProjectsFile = z.infer<typeof projectsFile>;
export type CalendarFile = z.infer<typeof calendarFile>;
export type WikiFile = z.infer<typeof wikiFile>;
export type ChatFile = z.infer<typeof chatFile>;
export type ChatMessage = z.infer<typeof chatMessage>;
export type KnowledgeGraphSeed = {
  embeddings: z.infer<typeof knowledgeGraphEmbeddingsFile>;
  extractions: z.infer<typeof knowledgeGraphExtractionsFile>;
  manifest: z.infer<typeof knowledgeGraphManifestFile>;
};

export type Workspace = {
  calendar: CalendarFile;
  chat: ChatFile;
  projects: ProjectsFile;
  slug: string;
  wiki: WikiFile;
  // 위키 파일 이름으로 찾는 Markdown 본문이다.
  wikiMarkdown: Map<string, string>;
};

async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const raw = await readFile(new URL(path, dataDirectory), 'utf8');
  const parsed = schema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `데모 자료 형식이 올바르지 않습니다: ${path}\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

export function readUsers(): Promise<UsersFile> {
  return readJson('users.json', usersFile);
}

export function readAvatar(fileName: string): Promise<Blob> {
  return openAsBlob(new URL(`avatars/${fileName}`, dataDirectory));
}

export async function readKnowledgeGraphSeed(): Promise<KnowledgeGraphSeed> {
  const [embeddings, extractions, manifest] = await Promise.all([
    readJson('knowledge-graph/embeddings.json', knowledgeGraphEmbeddingsFile),
    readJson('knowledge-graph/extractions.json', knowledgeGraphExtractionsFile),
    readJson('knowledge-graph/manifest.json', knowledgeGraphManifestFile),
  ]);
  return { embeddings, extractions, manifest };
}

export async function readWorkspace(slug: string): Promise<Workspace> {
  const base = `workspaces/${slug}`;
  const [projects, calendar, wiki, chat] = await Promise.all([
    readJson(`${base}/projects.json`, projectsFile),
    readJson(`${base}/calendar.json`, calendarFile),
    readJson(`${base}/wiki.json`, wikiFile),
    readJson(`${base}/chat.json`, chatFile),
  ]);
  const wikiMarkdown = new Map<string, string>();
  for (const document of wiki.documents) {
    wikiMarkdown.set(
      document.file,
      await readFile(
        new URL(`${base}/wiki/${document.file}`, dataDirectory),
        'utf8',
      ),
    );
  }
  return { slug, projects, calendar, wiki, chat, wikiMarkdown };
}
