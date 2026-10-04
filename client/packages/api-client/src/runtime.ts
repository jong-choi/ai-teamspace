import type { ProblemDetails as ProblemDetailsType } from '@monorepo-erp/api-client/schemas';
import { ProblemDetails } from '@monorepo-erp/api-client/schemas';

import type { ZodType } from 'zod';

export type ApiFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type ApiRuntimeConfiguration = {
  baseUrl?: string;
  credentials?: RequestCredentials;
  expoOrigin?: string;
  fetcher?: ApiFetch;
  getCookie?: () => Promise<string>;
};

export type ApiRequestOptions = RequestInit & {
  schema?: ZodType;
};

export type ErrorType<T> = T | Error;

let runtimeConfiguration: ApiRuntimeConfiguration = {};

export function configureApiRuntime(
  configuration: ApiRuntimeConfiguration,
): void {
  runtimeConfiguration = {
    baseUrl: normalizeBaseUrl(configuration.baseUrl),
    credentials: configuration.credentials,
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

export function getApiCredentials(): RequestCredentials {
  return runtimeConfiguration.credentials ?? 'include';
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

export function workOsFetcher<T>(
  url: string,
  options: ApiRequestOptions,
): Promise<T>;
export async function workOsFetcher(
  url: string,
  options: ApiRequestOptions,
): Promise<unknown> {
  const { schema, ...requestOptions } = options;
  const response = await getApiFetch()(getApiUrl(url), {
    ...requestOptions,
    credentials: requestOptions.credentials ?? getApiCredentials(),
    headers: await getApiHeaders(requestOptions.headers),
  });
  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw parseProblemDetails(response.status, body);
  }

  if (response.status === 204 || response.status === 205) {
    return undefined;
  }

  return schema ? schema.parse(body) : body;
}

export function getProblemDetails(error: unknown): ProblemDetailsType | null {
  const result = ProblemDetails.safeParse(error);
  return result.success ? result.data : null;
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

function parseProblemDetails(
  status: number,
  body: unknown,
): ProblemDetailsType {
  const result = ProblemDetails.safeParse(body);
  if (!result.success) {
    throw new Error(
      `Work OS API returned an invalid Problem Details response (${status}).`,
      {
        cause: body,
      },
    );
  }

  if (result.data.status !== status) {
    throw new Error(
      `Work OS API Problem Details status mismatch (${status} !== ${result.data.status}).`,
      { cause: result.data },
    );
  }

  return result.data;
}

function normalizeBaseUrl(value?: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.replace(/\/$/, '');
}
