import {
  SemanticLeaseLostError,
  SemanticProviderError,
} from '@/knowledge-graph/domain/semantic-error';

export function providerStatusError(
  status: number,
  retryAfterMs: number | null = null,
) {
  if (status === 401) return new SemanticProviderError('PROVIDER_UNAUTHORIZED');
  if (status === 403) return new SemanticProviderError('PROVIDER_FORBIDDEN');
  if (status === 429)
    return new SemanticProviderError('PROVIDER_RATE_LIMITED', retryAfterMs);
  if (status === 408 || status === 504)
    return new SemanticProviderError('PROVIDER_TIMEOUT');
  return new SemanticProviderError(
    status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'EXTRACTION_INVALID_RESPONSE',
  );
}

export function createClassifiedProviderFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const supplied =
      init?.signal ?? (input instanceof Request ? input.signal : null);
    if (supplied?.aborted) throw new SemanticLeaseLostError();
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const response = await globalThis.fetch(input, {
        ...init,
        signal: supplied ? AbortSignal.any([supplied, timeout]) : timeout,
      });
      if (response.ok) return response;
      const value = response.headers.get('retry-after');
      const seconds = value === null ? NaN : Number(value);
      const date = value === null ? NaN : Date.parse(value);
      const retryAfterMs =
        Number.isFinite(seconds) && seconds >= 0
          ? Math.min(seconds * 1000, 300_000)
          : Number.isFinite(date)
            ? Math.min(Math.max(0, date - Date.now()), 300_000)
            : null;
      await response.body?.cancel();
      throw providerStatusError(response.status, retryAfterMs);
    } catch (error) {
      if (error instanceof SemanticProviderError) throw error;
      if (supplied?.aborted) throw new SemanticLeaseLostError();
      if (
        timeout.aborted ||
        (error instanceof Error &&
          (error.name === 'TimeoutError' || error.name === 'AbortError'))
      )
        throw new SemanticProviderError('PROVIDER_TIMEOUT');
      throw new SemanticProviderError('PROVIDER_UNAVAILABLE');
    }
  };
}
