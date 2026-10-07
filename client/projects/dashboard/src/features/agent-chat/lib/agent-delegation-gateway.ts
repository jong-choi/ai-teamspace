import {
  getApiCredentials,
  getApiFetch,
  getApiHeaders,
  getApiUrl,
  getProblemDetails,
} from '@repo/client/api-client/runtime';

import { z } from 'zod';

export const AgentDelegationStatusSchema = z.enum([
  'not_connected',
  'pending_consent',
  'active',
  'refresh_required',
  'revoked',
  'forbidden',
  'no_membership',
]);

export type AgentDelegationStatus = z.infer<typeof AgentDelegationStatusSchema>;

export const AgentDelegationStateSchema = z.object({
  status: AgentDelegationStatusSchema,
  grantedScopes: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().nullable().default(null),
});

export type AgentDelegationState = z.infer<typeof AgentDelegationStateSchema>;

const AgentDelegationStartResponseSchema = z.object({
  status: AgentDelegationStatusSchema,
  authorizationUrl: z.string().url().nullable().default(null),
  grantedScopes: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().nullable().default(null),
});

export type AgentDelegationStartResult = z.infer<
  typeof AgentDelegationStartResponseSchema
>;

export interface AgentDelegationGateway {
  get(): Promise<AgentDelegationState>;
  start(returnTo: string): Promise<AgentDelegationStartResult>;
  revoke(): Promise<void>;
}

export function getAgentDelegationGateway(): AgentDelegationGateway {
  return process.env.EXPO_PUBLIC_AGENT_DELEGATION_TRANSPORT === 'mock'
    ? mockAgentDelegationGateway
    : restAgentDelegationGateway;
}

export const restAgentDelegationGateway: AgentDelegationGateway = {
  async get() {
    return AgentDelegationStateSchema.parse(
      await request('/api/mcp/agent-delegation', { method: 'GET' }),
    );
  },
  async start(returnTo) {
    return AgentDelegationStartResponseSchema.parse(
      await request('/api/mcp/agent-delegation/start', {
        method: 'POST',
        body: JSON.stringify({ returnTo }),
      }),
    );
  },
  async revoke() {
    await request('/api/mcp/agent-delegation', { method: 'DELETE' });
  },
};

let mockState: AgentDelegationState | null = null;

export const mockAgentDelegationGateway: AgentDelegationGateway = {
  async get() {
    if (!mockState) {
      mockState = {
        status: mockInitialStatus(),
        grantedScopes: [],
        expiresAt: null,
      };
    }
    return { ...mockState, grantedScopes: [...mockState.grantedScopes] };
  },
  async start() {
    mockState = {
      status: 'active',
      grantedScopes: [],
      expiresAt: null,
    };
    return {
      ...mockState,
      authorizationUrl: null,
      grantedScopes: [...mockState.grantedScopes],
    };
  },
  async revoke() {
    mockState = {
      status: 'revoked',
      grantedScopes: [],
      expiresAt: null,
    };
  },
};

export function resetMockAgentDelegationStateForTests(): void {
  mockState = null;
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  const response = await getApiFetch()(getApiUrl(path), {
    ...init,
    credentials: init.credentials ?? getApiCredentials(),
    headers: await getApiHeaders({
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    }),
  });
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const problem = getProblemDetails(body);
    if (problem) throw problem;
    throw new Error(
      'Agent delegation request failed (' + response.status + ').',
    );
  }

  return body;
}

function mockInitialStatus(): AgentDelegationStatus {
  const configured = process.env.EXPO_PUBLIC_AGENT_DELEGATION_MOCK;
  return AgentDelegationStatusSchema.safeParse(configured).success
    ? (configured as AgentDelegationStatus)
    : 'active';
}
