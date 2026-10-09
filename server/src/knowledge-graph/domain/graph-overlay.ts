import {
  applySemanticCorrections,
  type SemanticCorrection,
  type SemanticCorrectionGraph,
} from '@/knowledge-graph/domain/semantic-correction';

export function applyGraphCorrectionOverlay(
  graph: SemanticCorrectionGraph,
  corrections: readonly SemanticCorrection[],
) {
  return applySemanticCorrections(graph, corrections);
}
