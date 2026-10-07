import { OrganizationAuthorizationChangedProcessor } from '@/jobs/organization-authorization-changed.processor';
import { McpAccessService } from '@/mcp-access/mcp-access.service';
import { ORGANIZATION_AUTHORIZATION_CHANGED_JOB } from '@/organizations/domain/organization-public-event';
import { WikiCollaborationInvalidationPublisher } from '@/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider';

import type { Job } from 'bullmq';

describe('OrganizationAuthorizationChangedProcessor', () => {
  it('한 organization authorization event를 Wiki와 MCP 양쪽에 fan-out한다', async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const handleOrganizationAuthorizationChanged = jest
      .fn()
      .mockResolvedValue('deleted');

    const processor = new OrganizationAuthorizationChangedProcessor(
      { publish } as unknown as WikiCollaborationInvalidationPublisher,
      {
        handleOrganizationAuthorizationChanged,
      } as unknown as McpAccessService,
    );

    const data = {
      organizationId: 'org-1',
      userId: 'user-1',
      reason: 'member-removed',
    } as const;

    await processor.process({
      name: ORGANIZATION_AUTHORIZATION_CHANGED_JOB,
      data,
    } as Job);

    expect(publish).toHaveBeenCalledWith({
      scope: 'organization-user',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(handleOrganizationAuthorizationChanged).toHaveBeenCalledWith(data);
  });

  it('알 수 없는 public event job은 fail-closed한다', async () => {
    const processor = new OrganizationAuthorizationChangedProcessor(
      {
        publish: jest.fn(),
      } as unknown as WikiCollaborationInvalidationPublisher,
      {
        handleOrganizationAuthorizationChanged: jest.fn(),
      } as unknown as McpAccessService,
    );

    await expect(
      processor.process({ name: 'unknown-event', data: {} } as Job),
    ).rejects.toThrow('지원하지 않는 organization public event');
  });
});
