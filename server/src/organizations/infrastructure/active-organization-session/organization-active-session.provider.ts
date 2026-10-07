import type { IncomingHttpHeaders } from 'node:http';

export abstract class OrganizationActiveSessionProvider {
  abstract setActive(
    headers: IncomingHttpHeaders,
    organizationId: string | null,
  ): Promise<void>;
}
