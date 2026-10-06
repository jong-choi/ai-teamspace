import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ORGANIZATION_PUBLIC_EVENT_QUEUE } from '@/organizations/domain/organization-public-event';
import { BullMqOrganizationPublicEventPublisher } from '@/organizations/infrastructure/events/bullmq/bullmq-organization-public-event.publisher';
import { OrganizationPublicEventPublisher } from '@/organizations/infrastructure/events/organization-public-event.provider';
import { QueueModule } from '@/queue/queue.module';

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
