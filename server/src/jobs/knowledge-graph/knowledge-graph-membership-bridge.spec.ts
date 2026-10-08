import { Test } from '@nestjs/testing';

import { DatabaseService } from '@/database/database.service';
import { KnowledgeGraphMembershipBridge } from '@/jobs/knowledge-graph/knowledge-graph-membership-bridge';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { OrganizationAuthorizationChangedEventSchema } from '@/organizations/domain/organization-public-event';
import { MembershipProjectionQueryService } from '@/organizations/membership-projection-query.service';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';

describe('조직 권한 이벤트의 그래프 변경 접수', () => {
  const config = { enabled: true };
  const current = jest.fn();
  const membershipChanged = jest.fn();
  const transaction = jest.fn();
  const ownerTransaction = {};
  const event = OrganizationAuthorizationChangedEventSchema.parse({
    organizationId: 'org-a',
    userId: 'actor-a',
    reason: 'member-removed',
  });
  let bridge: KnowledgeGraphMembershipBridge;

  beforeEach(async () => {
    jest.resetAllMocks();
    config.enabled = true;
    transaction.mockImplementation(
      async (run: (transaction: object) => Promise<void>) =>
        run(ownerTransaction),
    );
    membershipChanged.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        KnowledgeGraphMembershipBridge,
        { provide: knowledgeGraphConfig.KEY, useValue: config },
        { provide: DatabaseService, useValue: { db: { transaction } } },
        { provide: MembershipProjectionQueryService, useValue: { current } },
        {
          provide: OutboxAggregateChangePublisher,
          useValue: { membershipChanged },
        },
      ],
    }).compile();
    bridge = moduleRef.get(KnowledgeGraphMembershipBridge);
  });

  it('비활성 그래프는 기존 권한 전달에 조회나 쓰기 의존성을 추가하지 않는다', async () => {
    config.enabled = false;
    await bridge.record(event);
    expect(current).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(membershipChanged).not.toHaveBeenCalled();
  });

  it('삭제 이벤트도 현재 owner에 멤버가 있으면 최신 상태 변경으로 접수한다', async () => {
    current.mockResolvedValueOnce({ userId: 'actor-a' });
    await bridge.record(event);
    expect(current).toHaveBeenCalledWith('org-a', 'actor-a');
    expect(membershipChanged).toHaveBeenCalledWith(
      ownerTransaction,
      'org-a',
      'actor-a',
      'changed',
    );
  });

  it('현재 owner에 멤버가 없으면 삭제 의도를 접수한다', async () => {
    current.mockResolvedValueOnce(null);
    await bridge.record(event);
    expect(membershipChanged).toHaveBeenCalledWith(
      ownerTransaction,
      'org-a',
      'actor-a',
      'removed',
    );
  });
});
