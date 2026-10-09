export interface SemanticSearchCandidate {
  sourceId: string;
  score: number;
  chunkIndex: number;
  generationId: string;
  text: string;
  indexedSourceUpdatedAt: Date;
}

export interface KeywordSearchCandidate {
  sourceId: string;
  matchedIn: readonly ('title' | 'content')[];
}

export interface FusedSearchCandidate {
  sourceId: string;
  fusedScore: number;
  semanticRank: number | null;
  keywordRank: number | null;
  semantic: SemanticSearchCandidate | null;
  keyword: KeywordSearchCandidate | null;
}

const RRF_K = 60;

export function fuseSearchCandidates(input: {
  semantic: readonly SemanticSearchCandidate[];
  keyword: readonly KeywordSearchCandidate[];
  limit: number;
}): FusedSearchCandidate[] {
  const bySource = new Map<string, FusedSearchCandidate>();
  for (const [index, semantic] of input.semantic.entries()) {
    const rank = index + 1;
    bySource.set(semantic.sourceId, {
      sourceId: semantic.sourceId,
      fusedScore: 1 / (RRF_K + rank),
      semanticRank: rank,
      keywordRank: null,
      semantic,
      keyword: null,
    });
  }
  for (const [index, keyword] of input.keyword.entries()) {
    const rank = index + 1;
    const existing = bySource.get(keyword.sourceId);
    if (existing) {
      existing.keywordRank = rank;
      existing.keyword = keyword;
      existing.fusedScore += 1 / (RRF_K + rank);
    } else {
      bySource.set(keyword.sourceId, {
        sourceId: keyword.sourceId,
        fusedScore: 1 / (RRF_K + rank),
        semanticRank: null,
        keywordRank: rank,
        semantic: null,
        keyword,
      });
    }
  }
  return [...bySource.values()]
    .sort((left, right) => {
      const scoreDelta = right.fusedScore - left.fusedScore;
      if (scoreDelta !== 0) return scoreDelta;
      const semanticDelta =
        (right.semantic?.score ?? Number.NEGATIVE_INFINITY) -
        (left.semantic?.score ?? Number.NEGATIVE_INFINITY);
      if (semanticDelta !== 0) return semanticDelta;
      return left.sourceId.localeCompare(right.sourceId);
    })
    .slice(0, input.limit);
}

export function foldSemanticHitsBySource(
  hits: readonly SemanticSearchCandidate[],
): SemanticSearchCandidate[] {
  const bySource = new Map<string, SemanticSearchCandidate>();
  for (const hit of hits) {
    const existing = bySource.get(hit.sourceId);
    if (!existing || hit.score > existing.score)
      bySource.set(hit.sourceId, hit);
  }
  return [...bySource.values()].sort((left, right) => {
    const scoreDelta = right.score - left.score;
    if (scoreDelta !== 0) return scoreDelta;
    return left.sourceId.localeCompare(right.sourceId);
  });
}

export function buildPlainTextExcerpt(input: {
  text: string;
  query: string;
  maxLength?: number;
}): string | null {
  const maxLength = input.maxLength ?? 600;
  const plain = input.text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[>#*_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return null;
  if (plain.length <= maxLength) return plain;

  const query = input.query.trim().toLocaleLowerCase();
  const foundAt = query ? plain.toLocaleLowerCase().indexOf(query) : -1;
  const center = foundAt >= 0 ? foundAt : 0;
  let start = Math.max(
    0,
    Math.min(
      center - Math.floor(maxLength / 3),
      Math.max(0, plain.length - maxLength),
    ),
  );
  if (start > 0) {
    const nextBoundary = plain.indexOf(' ', start);
    if (nextBoundary >= 0 && nextBoundary - start < 40)
      start = nextBoundary + 1;
  }

  const prefix = start > 0 ? '…' : '';
  const suffixRequired = start + maxLength < plain.length;
  const suffix = suffixRequired ? '…' : '';
  const textBudget = Math.max(1, maxLength - prefix.length - suffix.length);
  let end = Math.min(plain.length, start + textBudget);
  if (end < plain.length) {
    const previousBoundary = plain.lastIndexOf(' ', end);
    if (previousBoundary > start) end = previousBoundary;
  }
  const sliced = plain.slice(start, end).trim();
  return `${prefix}${sliced}${suffix}`.slice(0, maxLength);
}
