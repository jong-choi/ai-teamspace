export type SemanticSearchPlan =
  | {
      kind: 'exact';
      candidateLimit: number;
    }
  | {
      kind: 'approximate';
      overfetchSteps: readonly number[];
    };

const ANN_OVERFETCH_STEPS = [100, 400, 1600] as const;

export function planSemanticSearch(input: {
  searchableSourceCount: number;
  ennMaxSources: number;
  candidateLimit: number;
}): SemanticSearchPlan {
  if (input.searchableSourceCount <= input.ennMaxSources)
    return { kind: 'exact', candidateLimit: input.candidateLimit };
  return { kind: 'approximate', overfetchSteps: ANN_OVERFETCH_STEPS };
}
