/** queue 교체에도 같은 원본 요구의 영속 시도 상한을 유지한다. */
export const semanticRetryLimits = {
  attempts: 4,
  rateLimitedAttempts: 5,
} as const;
