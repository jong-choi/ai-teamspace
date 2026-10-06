import type { OrganizationAuthorizationChangedEvent } from '@/organizations/domain/organization-public-event';

export abstract class OrganizationPublicEventPublisher {
  abstract publishAuthorizationChanged(
    event: OrganizationAuthorizationChangedEvent,
  ): Promise<void>;
}
