import { Test } from '@nestjs/testing';

import { KnowledgeGraphMembershipBridge } from '@/jobs/knowledge-graph/knowledge-graph-membership-bridge';
import { OrganizationAuthorizationChangedProcessor } from '@/jobs/organization-authorization-changed.processor';
import { McpAccessService } from '@/mcp-access/mcp-access.service';
import { ORGANIZATION_AUTHORIZATION_CHANGED_JOB } from '@/organizations/domain/organization-public-event';
import { WikiCollaborationInvalidationPublisher } from '@/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider';

describe('조직 권한 변경 전달', () => {
  const publish = jest.fn();
  const handleOrganizationAuthorizationChanged = jest.fn();
  const record = jest.fn();
  const data = {
    organizationId: 'org-1',
    userId: 'user-1',
    reason: 'member-removed',
  };
  let processor: OrganizationAuthorizationChangedProcessor;

  beforeEach(async () => {
    jest.resetAllMocks();
    publish.mockResolvedValue(undefined);
    handleOrganizationAuthorizationChanged.mockResolvedValue('deleted');
    record.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationAuthorizationChangedProcessor,
        {
          provide: WikiCollaborationInvalidationPublisher,
          useValue: { publish },
        },
        {
          provide: McpAccessService,
          useValue: { handleOrganizationAuthorizationChanged },
        },
        { provide: KnowledgeGraphMembershipBridge, useValue: { record } },
      ],
    }).compile();
    processor = moduleRef.get(OrganizationAuthorizationChangedProcessor);
  });

  it('권한 변경을 Wiki와 MCP 및 그래프에 전달한다', async () => {
    await processor.process({
      name: ORGANIZATION_AUTHORIZATION_CHANGED_JOB,
      data,
    });
    expect(publish).toHaveBeenCalledWith({
      scope: 'organization-user',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(handleOrganizationAuthorizationChanged).toHaveBeenCalledWith(data);
    expect(record).toHaveBeenCalledWith(data);
  });

  it('지원하지 않는 작업은 모든 소비자 호출 전에 거부한다', async () => {
    await expect(
      processor.process({ name: 'unknown-event', data: {} }),
    ).rejects.toThrow('지원하지 않는 organization public event');
    expect(publish).not.toHaveBeenCalled();
    expect(handleOrganizationAuthorizationChanged).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('잘못된 이벤트는 권한 무효화와 그래프 변경 전에 거부한다', async () => {
    await expect(
      processor.process({
        name: ORGANIZATION_AUTHORIZATION_CHANGED_JOB,
        data: {},
      }),
    ).rejects.toThrow();
    expect(publish).not.toHaveBeenCalled();
    expect(handleOrganizationAuthorizationChanged).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('그래프 전달 실패에도 권한 무효화를 시도하고 작업 재시도를 요청한다', async () => {
    record.mockRejectedValueOnce(new Error('그래프 접수 실패'));
    await expect(
      processor.process({ name: ORGANIZATION_AUTHORIZATION_CHANGED_JOB, data }),
    ).rejects.toThrow('그래프 접수 실패');
    expect(publish).toHaveBeenCalled();
    expect(handleOrganizationAuthorizationChanged).toHaveBeenCalledWith(data);
  });
});
