import { z } from 'zod';

/** 이름이 같은 기존 인덱스의 정의도 공식 저장소 초기화 전에 확인한다. */
export const SemanticVectorIndexSchema = z
  .object({
    type: z.literal('VECTOR'),
    labelsOrTypes: z.tuple([z.literal('KGSemanticChunk')]),
    properties: z.tuple([z.literal('embedding')]),
    dimension: z.coerce.number().pipe(z.literal(768)),
    similarity: z
      .string()
      .transform((value) => value.toLowerCase())
      .pipe(z.literal('cosine')),
  })
  .array()
  .length(1);

export const READ_SEMANTIC_VECTOR_INDEX = `
SHOW INDEXES YIELD name, type, labelsOrTypes, properties, options
WHERE name='kg_semantic_chunk_embedding_v1'
RETURN type, labelsOrTypes, properties,
 options.indexConfig['vector.dimensions'] AS dimension,
 options.indexConfig['vector.similarity_function'] AS similarity`;
