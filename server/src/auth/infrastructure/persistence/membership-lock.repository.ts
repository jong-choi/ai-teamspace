export abstract class MembershipLockRepository {
  abstract lockRole(
    organizationId: string,
    userId: string,
  ): Promise<string | null>;
}
