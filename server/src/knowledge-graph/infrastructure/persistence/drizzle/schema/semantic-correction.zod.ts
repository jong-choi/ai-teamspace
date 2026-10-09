import {
  SemanticCorrectionAnchorSchema,
  SemanticCorrectionValueSchema,
} from '@/knowledge-graph/domain/semantic-correction-anchor';
import {
  semanticCorrection,
  semanticCorrectionSource,
} from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/semantic-correction.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

const fields = {
  anchor: SemanticCorrectionAnchorSchema,
  value: SemanticCorrectionValueSchema.nullable(),
};
export const SemanticCorrectionSelectSchema = createSelectSchema(
  semanticCorrection,
  fields,
);
export const SemanticCorrectionInsertSchema = createInsertSchema(
  semanticCorrection,
  fields,
);
export const SemanticCorrectionUpdateSchema = createUpdateSchema(
  semanticCorrection,
  fields,
);
export const SemanticCorrectionSourceSelectSchema = createSelectSchema(
  semanticCorrectionSource,
);
export const SemanticCorrectionSourceInsertSchema = createInsertSchema(
  semanticCorrectionSource,
);
export const SemanticCorrectionSourceUpdateSchema = createUpdateSchema(
  semanticCorrectionSource,
);
