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
  abstract createInCurrentTransaction(
    input: SemanticCorrectionCreate,
  ): Promise<{ editRevision: number; corrections: SemanticCorrection[] }>;
  abstract createLinkedPairInCurrentTransaction(
    first: SemanticCorrectionCreate,
    second: SemanticCorrectionCreate,
  ): Promise<{ editRevision: number; corrections: SemanticCorrection[] }>;
  abstract findById(
    organizationId: string,
    correctionId: string,
  ): Promise<SemanticCorrection | null>;
  abstract cancel(
    scope: SemanticSourceScope,
    correctionId: string,
    actorUserId: string,
  ): Promise<{
    editRevision: number;
    corrections: SemanticCorrection[];
  } | null>;
  abstract cancelByIdInCurrentTransaction(
    organizationId: string,
    correctionId: string,
    actorUserId: string,
  ): Promise<
    | {
        outcome: 'cancelled';
        editRevision: number;
        corrections: SemanticCorrection[];
      }
    | { outcome: 'not_found' | 'not_active' }
  >;
  abstract replaceLabelOverrideByIdInCurrentTransaction(
    organizationId: string,
    correctionId: string,
    label: string,
    actorUserId: string,
  ): Promise<
    | {
        outcome: 'replaced';
        editRevision: number;
        corrections: SemanticCorrection[];
      }
    | { outcome: 'not_found' | 'not_active' }
  >;
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
