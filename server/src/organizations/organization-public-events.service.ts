import { Injectable, Logger } from '@nestjs/common';

import type { OrganizationAuthorizationChangedEvent } from '@/organizations/domain/organization-public-event';
import { OrganizationPublicEventPublisher } from '@/organizations/infrastructure/events/organization-public-event.provider';

@Injectable()
export class OrganizationPublicEventsService {
  private readonly logger = new Logger(OrganizationPublicEventsService.name);
  constructor(private readonly publisher: OrganizationPublicEventPublisher) {}

  async publishAuthorizationChanged(
    event: OrganizationAuthorizationChangedEvent,
  ): Promise<void> {
    try {
      await this.publisher.publishAuthorizationChanged(event);
    } catch (error) {
      this.logger.error(
        `조직 권한 invalidation event 발행에 실패했습니다: organization=${event.organizationId}, user=${event.userId}`,
        error,
      );
    }
  }
}
