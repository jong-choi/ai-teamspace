import { registerAs } from '@nestjs/config';

import { ollamaOriginUrlSchema } from '@/config/validation';
import validateConfig from '@/utils/validate-config';

import { z } from 'zod';

const knowledgeGraphEnvironmentSchema = z.object({
  KG_PROJECTION_ENABLED: z.enum(['true', 'false']).default('false'),
  KG_SEMANTIC_ENABLED: z.enum(['true', 'false']).default('false'),
  KG_QUERY_ENABLED: z.enum(['true', 'false']).default('false'),
  KG_GRAPH_READ_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30_000)
    .default(3000),
  KG_SEMANTIC_WORKER_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(8)
    .default(2),
  KG_SEMANTIC_PROVIDER_MAX_PER_MINUTE: z.coerce
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(30),
  KG_QUOTA_REFRESH_ACTOR_PER_HOUR: z.coerce
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(30),
  KG_QUOTA_REFRESH_ORG_PER_HOUR: z.coerce
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(300),
  KG_QUOTA_SEARCH_ACTOR_PER_MINUTE: z.coerce
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(60),
  KG_QUOTA_SEARCH_ORG_PER_MINUTE: z.coerce
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(600),
  KG_QUOTA_REBUILD_ORG_PER_DAY: z.coerce
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(3),
  KG_SEARCH_ENN_MAX_SOURCES: z.coerce
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(2000),
  NEO4J_URI: z.string().optional(),
  NEO4J_USERNAME: z.string().optional(),
  NEO4J_PASSWORD: z.string().optional(),
  NEO4J_DATABASE: z.string().optional(),
});

const semanticProviderEnvironmentSchema = z.object({
  OLLAMA_API_KEY: z.string().trim().min(1),
  OLLAMA_BASE_URL: ollamaOriginUrlSchema,
  GEMINI_API_KEY: z.string().trim().min(1),
});

export default registerAs('knowledgeGraph', () => {
  const environment = validateConfig(
    process.env,
    knowledgeGraphEnvironmentSchema,
  );
  const enabled = environment.KG_PROJECTION_ENABLED === 'true';
  const semanticEnabled = environment.KG_SEMANTIC_ENABLED === 'true';
  const queryEnabled = environment.KG_QUERY_ENABLED === 'true';
  if (semanticEnabled && !enabled)
    throw new Error('의미 색인은 업무 그래프 투영 활성화가 필요합니다.');
  const providers = semanticEnabled
    ? validateConfig(process.env, semanticProviderEnvironmentSchema)
    : null;
  const semantic = providers
    ? {
        ollamaApiKey: providers.OLLAMA_API_KEY,
        ollamaBaseUrl: providers.OLLAMA_BASE_URL,
        geminiApiKey: providers.GEMINI_API_KEY,
      }
    : null;

  if (
    (enabled || queryEnabled) &&
    (!environment.NEO4J_URI ||
      !environment.NEO4J_USERNAME ||
      !environment.NEO4J_PASSWORD)
  ) {
    throw new Error(
      '지식 그래프 투영을 활성화하려면 Neo4j 연결 설정이 모두 필요합니다.',
    );
  }

  return {
    enabled,
    semanticEnabled,
    query: {
      enabled: queryEnabled,
      graphReadTimeoutMs: environment.KG_GRAPH_READ_TIMEOUT_MS,
    },
    semanticWorkerConcurrency: environment.KG_SEMANTIC_WORKER_CONCURRENCY,
    semanticProviderMaxPerMinute:
      environment.KG_SEMANTIC_PROVIDER_MAX_PER_MINUTE,
    quota: {
      refreshActorPerHour: environment.KG_QUOTA_REFRESH_ACTOR_PER_HOUR,
      refreshOrganizationPerHour: environment.KG_QUOTA_REFRESH_ORG_PER_HOUR,
      searchActorPerMinute: environment.KG_QUOTA_SEARCH_ACTOR_PER_MINUTE,
      searchOrganizationPerMinute: environment.KG_QUOTA_SEARCH_ORG_PER_MINUTE,
      rebuildOrganizationPerDay: environment.KG_QUOTA_REBUILD_ORG_PER_DAY,
    },
    searchEnnMaxSources: environment.KG_SEARCH_ENN_MAX_SOURCES,
    semantic,
    url: environment.NEO4J_URI,
    username: environment.NEO4J_USERNAME,
    password: environment.NEO4J_PASSWORD,
    database: environment.NEO4J_DATABASE,
  };
});
