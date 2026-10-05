import type { OrganizationAuthorizationChangedEvent } from '#server/organizations/domain/organization-public-event.js';

export abstract class OrganizationPublicEventPublisher {
  abstract publishAuthorizationChanged(
    event: OrganizationAuthorizationChangedEvent,
  ): Promise<void>;
}
