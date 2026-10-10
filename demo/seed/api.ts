import { z } from 'zod';

const MAX_ATTEMPTS = 6;

export class ApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(method: string, path: string, status: number, body: string) {
    super(`${method} ${path} → ${status}\n${body}`);
    this.status = status;
    this.body = body;
  }
}

// 사용자 한 명의 로그인 상태를 들고 서버 API를 부른다.
export class ApiSession {
  private readonly baseUrl: string;
  private readonly cookies = new Map<string, string>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    return this.json('POST', path, body, schema);
  }

  put<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    return this.json('PUT', path, body, schema);
  }

  patch<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    return this.json('PATCH', path, body, schema);
  }

  get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    return this.json('GET', path, undefined, schema);
  }

  async putBinary(
    path: string,
    body: Blob,
    contentType: string,
  ): Promise<void> {
    await this.send('PUT', path, body, contentType);
  }

  private async json<T>(
    method: string,
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const response = await this.send(
      method,
      path,
      body === undefined ? undefined : JSON.stringify(body),
      'application/json',
    );
    const text = await response.text();
    const parsed = schema.safeParse(text ? JSON.parse(text) : undefined);
    if (!parsed.success) {
      throw new Error(
        `${method} ${path} 응답이 예상과 다릅니다.\n${z.prettifyError(parsed.error)}`,
      );
    }
    return parsed.data;
  }

  private async send(
    method: string,
    path: string,
    body: string | Blob | undefined,
    contentType: string,
  ): Promise<Response> {
    for (let attempt = 1; ; attempt += 1) {
      const response = await fetch(this.baseUrl + path, {
        method,
        body,
        headers: {
          // 서버는 신뢰하는 origin에서 온 변경 요청만 받는다.
          origin: this.baseUrl,
          ...(body === undefined ? {} : { 'content-type': contentType }),
          ...(this.cookies.size > 0 ? { cookie: this.cookieHeader() } : {}),
        },
      });
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(';');
        const separator = pair.indexOf('=');
        this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
      if (response.ok) return response;

      // 가입처럼 횟수 제한이 걸린 요청은 잠시 기다렸다가 다시 보낸다.
      if (response.status === 429 && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await new Promise((resolve) =>
          setTimeout(resolve, (retryAfter > 0 ? retryAfter : 2) * 1000),
        );
        continue;
      }
      throw new ApiError(method, path, response.status, await response.text());
    }
  }

  private cookieHeader(): string {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

// 응답에서 이 스크립트가 쓰는 값은 대부분 새로 만든 것의 ID 하나다.
export const created = z.object({ id: z.string() });
export const ignored = z.unknown();
