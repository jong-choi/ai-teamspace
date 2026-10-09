import { createClassifiedProviderFetch } from '@/knowledge-graph/infrastructure/provider-http/classified-provider-fetch';

describe('의미 공급자의 HTTP 오류와 민감값 경계', () => {
  afterEach(() => jest.restoreAllMocks());
  it('U7-13 실제timeout signal과caller취소를구분하고request를중단한다', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('공급자request중단', 'AbortError')),
            { once: true },
          );
        }),
    );
    await expect(
      createClassifiedProviderFetch(20)('https://provider.example.test'),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    const controller = new AbortController();
    const pending = createClassifiedProviderFetch(1000)(
      'https://provider.example.test',
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      message: 'SEMANTIC_LEASE_LOST',
    });
  });
  it('U7-13 Retry-After HTTP날짜형식도고정상한안의재시도시간으로읽는다', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', {
        status: 429,
        headers: {
          'retry-after': new Date(Date.now() + 60_000).toUTCString(),
        },
      }),
    );
    const failure = await createClassifiedProviderFetch(1000)(
      'https://provider.example.test',
    ).catch((error) => error);
    expect(failure).toMatchObject({ code: 'PROVIDER_RATE_LIMITED' });
    expect(failure.retryAfterMs).toBeGreaterThan(50_000);
    expect(failure.retryAfterMs).toBeLessThanOrEqual(60_000);
  });
  it.each([
    [401, 'PROVIDER_UNAUTHORIZED'],
    [403, 'PROVIDER_FORBIDDEN'],
    [408, 'PROVIDER_TIMEOUT'],
    [429, 'PROVIDER_RATE_LIMITED'],
    [500, 'PROVIDER_UNAVAILABLE'],
  ])('U7-13 HTTP %i는 고정 코드 %s로 분류한다', async (status, code) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('private-provider-body', {
        status: Number(status),
        headers: { 'Retry-After': '2' },
      }),
    );
    await expect(
      createClassifiedProviderFetch(1000)('https://provider.example.test'),
    ).rejects.toMatchObject({
      message: code,
      code,
      retryAfterMs: status === 429 ? 2000 : null,
    });
  });
  it('U7-13 network 오류의 주소·credential은 오류 메시지에 남기지 않는다', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('https://private:secret@provider.test'));
    await expect(
      createClassifiedProviderFetch(1000)('https://provider.example.test'),
    ).rejects.toMatchObject({
      message: 'PROVIDER_UNAVAILABLE',
      code: 'PROVIDER_UNAVAILABLE',
    });
  });
  it('U7-13 성공 응답은 body를 파싱하거나 변경하지 않는다', async () => {
    const response = new Response('tool-call');
    const call = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    expect(
      await createClassifiedProviderFetch(1000)(
        'https://provider.example.test',
      ),
    ).toBe(response);
    expect(call.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
