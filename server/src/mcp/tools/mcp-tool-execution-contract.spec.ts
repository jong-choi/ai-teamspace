import { bindMcpTool } from '@/mcp/tools/bound-mcp-tool';
import { McpToolAccessDeniedError } from '@/mcp/tools/mcp-tool.error';
import { McpToolAuthorizationService } from '@/mcp/tools/mcp-tool-authorization.service';
import {
  defineMcpTool,
  readOnlyAnnotations,
} from '@/mcp/tools/mcp-tool-definition';
import {
  organizationMembersListTool,
  organizationsListTool,
} from '@/mcp/tools/organizations/organization-tool-definitions';
import type { McpAccessService } from '@/mcp-access/mcp-access.service';

import { z } from 'zod';

const auth = {
  authMethod: 'api-key' as const,
  credentialId: 'key-a',
  userId: 'user-a',
  clientId: null,
  scopes: ['organizations:read' as const],
  allowedOrganizationIds: ['org-a'],
};

describe('MCP tool 실행 contract', () => {
  it('input parse → authorization → handler → output parse 순서를 강제한다', async () => {
    const events: string[] = [];
    const definition = defineMcpTool({
      name: 'contract_test',
      title: '테스트',
      description: '실행 순서를 검증합니다.',
      inputSchema: z.object({ value: z.string().trim().min(1) }),
      outputSchema: z.object({ value: z.string().min(1) }),
      requiredScope: 'organizations:read',
      classification: 'read',
      annotations: readOnlyAnnotations,
    });
    const tool = bindMcpTool(definition, async (input) => {
      events.push('handler');
      return { value: input.value.toUpperCase() };
    });

    await expect(
      tool.invoke({ value: ' hello ' }, auth, async (_definition, input) => {
        events.push('authorize');
        expect(input).toEqual({ value: 'hello' });
      }),
    ).resolves.toEqual({ value: 'HELLO' });
    expect(events).toEqual(['authorize', 'handler']);
  });

  it('invalid input이면 authorization과 handler를 호출하지 않는다', async () => {
    const authorize = jest.fn();
    const handler = jest.fn();
    const definition = defineMcpTool({
      name: 'invalid_input_test',
      title: '테스트',
      description: '잘못된 input을 검증합니다.',
      inputSchema: z.object({ required: z.string().min(1) }),
      outputSchema: z.object({ ok: z.boolean() }),
      requiredScope: 'organizations:read',
      classification: 'read',
      annotations: readOnlyAnnotations,
    });
    const tool = bindMcpTool(definition, handler);

    await expect(tool.invoke({}, auth, authorize)).rejects.toBeDefined();
    expect(authorize).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('output schema mismatch를 응답 전에 차단한다', async () => {
    const definition = defineMcpTool({
      name: 'invalid_output_test',
      title: '테스트',
      description: '잘못된 output을 검증합니다.',
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      requiredScope: 'organizations:read',
      classification: 'read',
      annotations: readOnlyAnnotations,
    });
    const tool = bindMcpTool(
      definition,
      async () => ({ ok: 'yes' }) as unknown as { ok: boolean },
    );

    await expect(
      tool.invoke({}, auth, async () => undefined),
    ).rejects.toBeDefined();
  });
});

describe('MCP tool live authorization', () => {
  it('organizations_list는 credential scope만 live recheck한다', async () => {
    const evaluate = jest.fn();
    const service = new McpToolAuthorizationService({
      evaluate,
    } as unknown as McpAccessService);

    await service.authorize(organizationsListTool, {}, auth);

    expect(evaluate).not.toHaveBeenCalled();
  });

  it('credential scope 부족은 policy 조회 전에 거부한다', async () => {
    const evaluate = jest.fn();
    const service = new McpToolAuthorizationService({
      evaluate,
    } as unknown as McpAccessService);

    await expect(
      service.authorize(
        organizationsListTool,
        {},
        {
          ...auth,
          scopes: [],
        },
      ),
    ).rejects.toMatchObject({
      reason: 'credential_scope',
      code: 'MCP_TOOL_ACCESS_DENIED',
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('organization tool은 Agent C evaluator의 denial reason을 보존한다', async () => {
    const evaluate = jest.fn().mockResolvedValue({
      allowed: false,
      requiredScope: 'organizations:read',
      reason: 'user_policy',
    });
    const service = new McpToolAuthorizationService({
      evaluate,
    } as unknown as McpAccessService);

    await expect(
      service.authorize(
        organizationMembersListTool,
        { organizationId: 'org-a' },
        auth,
      ),
    ).rejects.toEqual(expect.any(McpToolAccessDeniedError));
    await expect(
      service.authorize(
        organizationMembersListTool,
        { organizationId: 'org-a' },
        auth,
      ),
    ).rejects.toMatchObject({ reason: 'user_policy' });
  });
});
