import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ORGANIZATION_PUBLIC_EVENT_QUEUE } from '#server/organizations/domain/organization-public-event.js';
import { BullMqOrganizationPublicEventPublisher } from '#server/organizations/infrastructure/events/bullmq/bullmq-organization-public-event.publisher.js';
import { OrganizationPublicEventPublisher } from '#server/organizations/infrastructure/events/organization-public-event.provider.js';
import { QueueModule } from '#server/queue/queue.module.js';

@Module({
  imports: [
    QueueModule.forProducer(),
    BullModule.registerQueue({ name: ORGANIZATION_PUBLIC_EVENT_QUEUE }),
  ],
  providers: [
    {
      provide: OrganizationPublicEventPublisher,
      useClass: BullMqOrganizationPublicEventPublisher,
    },
  ],
  exports: [OrganizationPublicEventPublisher],
})
export class BullMqOrganizationPublicEventModule {}
