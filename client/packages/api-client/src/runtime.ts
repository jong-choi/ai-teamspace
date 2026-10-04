export type ApiFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type ApiRuntimeConfiguration = {
  baseUrl?: string;
  expoOrigin?: string;
  fetcher?: ApiFetch;
  getCookie?: () => Promise<string>;
};

export class WorkOsApiError extends Error {
  readonly info: unknown;
  readonly status: number;

  constructor(status: number, info: unknown) {
    super(`Work OS API request failed with ${status}`);
    this.name = 'WorkOsApiError';
    this.status = status;
    this.info = info;
  }
}

let runtimeConfiguration: ApiRuntimeConfiguration = {};

export function configureApiRuntime(
  configuration: ApiRuntimeConfiguration,
): void {
  runtimeConfiguration = {
    baseUrl: normalizeBaseUrl(configuration.baseUrl),
    expoOrigin: configuration.expoOrigin,
    fetcher: configuration.fetcher,
    getCookie: configuration.getCookie,
  };
}

export function getApiUrl(path: string): string {
  if (!path.startsWith('/')) {
    return path;
  }

  if (runtimeConfiguration.baseUrl) {
    return `${runtimeConfiguration.baseUrl}${path}`;
  }

  return path;
}

export function getApiFetch(): ApiFetch {
  return runtimeConfiguration.fetcher ?? globalThis.fetch;
}

export async function getApiHeaders(input?: HeadersInit): Promise<Headers> {
  const headers = new Headers(input);
  const cookie = await runtimeConfiguration.getCookie?.();

  if (cookie && !headers.has('cookie')) {
    headers.set('cookie', cookie);
  }
  if (runtimeConfiguration.expoOrigin && !headers.has('expo-origin')) {
    headers.set('expo-origin', runtimeConfiguration.expoOrigin);
  }

  return headers;
}

export async function workOsFetcher<T>(
  url: string,
  options: RequestInit,
): Promise<T> {
  const response = await getApiFetch()(getApiUrl(url), {
    ...options,
    credentials: options.credentials ?? 'include',
    headers: await getApiHeaders(options.headers),
  });
  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new WorkOsApiError(response.status, normalizeErrorInfo(body));
  }

  return {
    data: response.status === 204 || response.status === 205 ? undefined : body,
    status: response.status,
    headers: response.headers,
  } as T;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if ([204, 205, 304].includes(response.status)) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeErrorInfo(body: unknown): unknown {
  if (typeof body === 'string') {
    return { detail: body };
  }
  return body ?? {};
}

function normalizeBaseUrl(value?: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.replace(/\/$/, '');
}
