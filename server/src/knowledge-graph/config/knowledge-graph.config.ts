import { registerAs } from '@nestjs/config';

import validateConfig from '@/utils/validate-config';

import { z } from 'zod';

const knowledgeGraphEnvironmentSchema = z.object({
  KG_PROJECTION_ENABLED: z.enum(['true', 'false']).default('false'),
  NEO4J_URI: z.string().optional(),
  NEO4J_USERNAME: z.string().optional(),
  NEO4J_PASSWORD: z.string().optional(),
  NEO4J_DATABASE: z.string().optional(),
});

export default registerAs('knowledgeGraph', () => {
  const environment = validateConfig(
    process.env,
    knowledgeGraphEnvironmentSchema,
  );
  const enabled = environment.KG_PROJECTION_ENABLED === 'true';

  if (
    enabled &&
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
    url: environment.NEO4J_URI,
    username: environment.NEO4J_USERNAME,
    password: environment.NEO4J_PASSWORD,
    database: environment.NEO4J_DATABASE,
  };
});
