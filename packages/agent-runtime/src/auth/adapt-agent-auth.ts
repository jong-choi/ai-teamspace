import type {
  AuthContext,
  AuthEngine,
  AuthFilters,
  AuthUser,
} from '@repo/agent-runtime/core';
import { SkeinHttpError } from '@repo/agent-runtime/core';

import { isAuthMatching } from '@langchain/langgraph-api/auth';

interface AuthOnParameter {
  event: string;
  resource: string;
  action: string;
  value: unknown;
  user: AuthUser;
  permissions: string[];
}

type AuthenticateCallback = (request: Request) => unknown | Promise<unknown>;
type OnCallback = (parameter: AuthOnParameter) => unknown | Promise<unknown>;

interface AgentAuthInstance {
  '~handlerCache': {
    authenticate?: AuthenticateCallback;
    callbacks?: Record<string, OnCallback>;
  };
}

function isHttpException(error: unknown): error is {
  status: number;
  message?: string;
  headers: unknown;
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    'headers' in error
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rethrowAsSkeinError(error: unknown): never {
  if (isHttpException(error)) {
    throw new SkeinHttpError(error.status, error.message || 'Unauthorized', {
      cause: error,
    });
  }
  throw error;
}

function normalizeUser(response: unknown): AuthContext {
  if (typeof response === 'string') {
    const user: AuthUser = {
      identity: response,
      display_name: response,
      is_authenticated: true,
      permissions: [],
    };
    return { user, scopes: [] };
  }

  if (isRecord(response) && typeof response['identity'] === 'string') {
    const identity = response['identity'];
    const permissions = response['permissions'];
    const scopes = Array.isArray(permissions)
      ? permissions.filter(
          (permission): permission is string => typeof permission === 'string',
        )
      : [];
    const user: AuthUser = {
      ...response,
      identity,
      permissions: scopes,
      is_authenticated:
        typeof response['is_authenticated'] === 'boolean'
          ? response['is_authenticated']
          : true,
      display_name:
        typeof response['display_name'] === 'string'
          ? response['display_name']
          : identity,
    };
    return { user, scopes };
  }

  throw new SkeinHttpError(
    500,
    'Agent auth handler must return a string identity or an object with identity.',
  );
}

function isAuthFilters(value: unknown): value is AuthFilters {
  if (!isRecord(value)) return false;
  return Object.values(value).every((filter) => {
    if (typeof filter === 'string') return true;
    if (!isRecord(filter)) return false;
    return Object.entries(filter).every(([operator, operand]) => {
      if (operator === '$eq') return typeof operand === 'string';
      if (operator !== '$contains') return false;
      return (
        typeof operand === 'string' ||
        (Array.isArray(operand) &&
          operand.every((item) => typeof item === 'string'))
      );
    });
  });
}

/** LangGraph SDK `Auth`를 Skein의 injectable `AuthEngine`으로 변환한다. */
export function adaptAgentAuth(auth: AgentAuthInstance): AuthEngine {
  const handlers = auth['~handlerCache'];

  return {
    enabled: true,
    studioAuthDisabled: true,
    async authenticate(request) {
      if (!handlers.authenticate) return undefined;
      try {
        return normalizeUser(await handlers.authenticate(request));
      } catch (error) {
        rethrowAsSkeinError(error);
      }
    },
    async authorize({ resource, action, value, context }) {
      const callbacks = handlers.callbacks;
      const key = [`${resource}:${action}`, resource, `*:${action}`, '*'].find(
        (candidate) => callbacks?.[candidate],
      );
      const handler = key ? callbacks?.[key] : undefined;
      if (!handler || !context) return { filters: undefined, value };

      try {
        const result = await handler({
          event: `${resource}:${action}`,
          resource,
          action,
          value,
          user: context.user,
          permissions: context.scopes,
        });
        if (result == null || result === true) {
          return { filters: undefined, value };
        }
        if (result === false) {
          throw new SkeinHttpError(403, 'Forbidden.');
        }
        if (!isAuthFilters(result)) {
          throw new SkeinHttpError(
            500,
            'Agent auth handler returned an invalid authorization result.',
          );
        }
        return { filters: result, value };
      } catch (error) {
        rethrowAsSkeinError(error);
      }
    },
    matchesFilters(metadata, filters) {
      return isAuthMatching(metadata, filters);
    },
  };
}
