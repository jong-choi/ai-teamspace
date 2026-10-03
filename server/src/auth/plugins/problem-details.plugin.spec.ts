import { toAuthProblemResponse } from '#server/auth/plugins/problem-details.plugin.js';
import { problemDetailsOptions } from '#server/common/http/problem-details.js';

import { ProblemDetailsFactory } from '@camcima/nestjs-rfc9457';

const factory = new ProblemDetailsFactory(problemDetailsOptions);

describe('인증 HTTP 오류 변환', () => {
  it('오류 상태와 재시도 헤더 및 여러 쿠키를 보존한다', async () => {
    const headers = new Headers({
      'retry-after': '60',
      'content-length': '100',
    });
    headers.append('set-cookie', 'first=; Max-Age=0; Path=/');
    headers.append('set-cookie', 'second=; Max-Age=0; Path=/');
    const response = await toAuthProblemResponse(
      factory,
      new Response(
        JSON.stringify({
          code: 'RATE_LIMITED',
          message: '잠시 후 다시 시도하세요.',
        }),
        { status: 429, headers },
      ),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.has('content-length')).toBe(false);
    expect(await response.json()).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('성공 응답과 리다이렉트는 원본 그대로 반환한다', async () => {
    const success = new Response('{}', {
      headers: { 'set-cookie': 'session=value' },
    });
    const redirect = Response.redirect('https://example.com');
    expect(await toAuthProblemResponse(factory, success)).toBe(success);
    expect(await toAuthProblemResponse(factory, redirect)).toBe(redirect);
  });

  it('서버 오류의 내부 메시지를 노출하지 않는다', async () => {
    const response = await toAuthProblemResponse(
      factory,
      new Response(JSON.stringify({ message: '민감한 내부 값' }), {
        status: 500,
      }),
    );
    expect(await response.json()).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
    });
  });
});
