import { z } from 'zod';

import {
  resolveKnowledgeGraphTargets,
  seedKnowledgeGraph,
} from '#seed/seed-knowledge-graph.ts';
import {
  readKnowledgeGraphSeed,
  readUsers,
  readWorkspace,
} from '#seed/source.ts';

const environment = z
  .object({
    DEMO_DATABASE_URL: z.string().min(1),
    DEMO_NEO4J_URI: z.string().min(1),
    DEMO_NEO4J_USERNAME: z.string().min(1),
    DEMO_NEO4J_PASSWORD: z.string().min(1),
    DEMO_NEO4J_DATABASE: z.string().min(1).default('neo4j'),
  })
  .parse(process.env);

const users = await readUsers();
const [workspaces, graph] = await Promise.all([
  Promise.all(
    users.organizations.map((organization) => readWorkspace(organization.slug)),
  ),
  readKnowledgeGraphSeed(),
]);
const targets = await resolveKnowledgeGraphTargets(
  environment.DEMO_DATABASE_URL,
  workspaces,
);

await seedKnowledgeGraph({
  databaseUrl: environment.DEMO_DATABASE_URL,
  graph,
  neo4j: {
    database: environment.DEMO_NEO4J_DATABASE,
    password: environment.DEMO_NEO4J_PASSWORD,
    uri: environment.DEMO_NEO4J_URI,
    username: environment.DEMO_NEO4J_USERNAME,
  },
  targets,
});
