import type {
  SemanticCorrection,
  SemanticCorrectionCreate,
  SemanticCorrectionMatchReport,
} from '@/knowledge-graph/domain/semantic-correction';
import type { SemanticSourceScope } from '@/outbox/domain/semantic-source';

export abstract class SemanticCorrectionRepository {
  abstract create(
    input: SemanticCorrectionCreate,
  ): Promise<{ editRevision: number; corrections: SemanticCorrection[] }>;
  abstract createLinkedPair(
    first: SemanticCorrectionCreate,
    second: SemanticCorrectionCreate,
  ): Promise<{ editRevision: number; corrections: SemanticCorrection[] }>;
  abstract cancel(
    scope: SemanticSourceScope,
    correctionId: string,
    actorUserId: string,
  ): Promise<{
    editRevision: number;
    corrections: SemanticCorrection[];
  } | null>;
  abstract listActive(scope: SemanticSourceScope): Promise<{
    editRevision: number;
    corrections: SemanticCorrection[];
  }>;
  abstract reportMatches(
    scope: SemanticSourceScope,
    generationId: string,
    reports: readonly SemanticCorrectionMatchReport[],
  ): Promise<void>;
}
