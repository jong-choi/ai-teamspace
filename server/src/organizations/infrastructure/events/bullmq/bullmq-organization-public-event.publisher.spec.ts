import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';

import {
  ORGANIZATION_AUTHORIZATION_CHANGED_JOB,
  ORGANIZATION_PUBLIC_EVENT_QUEUE,
} from '#server/organizations/domain/organization-public-event.js';
import { BullMqOrganizationPublicEventPublisher } from '#server/organizations/infrastructure/events/bullmq/bullmq-organization-public-event.publisher.js';

import { jest } from '@jest/globals';

describe('조직 public event BullMQ publisher', () => {
  it('권한 변경 이벤트를 재시도 가능한 작업으로 발행한다', async () => {
    const queue = { add: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        BullMqOrganizationPublicEventPublisher,
        {
          provide: getQueueToken(ORGANIZATION_PUBLIC_EVENT_QUEUE),
          useValue: queue,
        },
      ],
    }).compile();
    const publisher = module.get(BullMqOrganizationPublicEventPublisher);
    const event = {
      organizationId: 'organization-a',
      userId: 'user-a',
      reason: 'member-removed' as const,
    };

    await publisher.publishAuthorizationChanged(event);

    expect(queue.add).toHaveBeenCalledWith(
      ORGANIZATION_AUTHORIZATION_CHANGED_JOB,
      event,
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  });
});
