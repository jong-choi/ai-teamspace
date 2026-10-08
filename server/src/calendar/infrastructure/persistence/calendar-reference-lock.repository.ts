export abstract class CalendarReferenceLockRepository {
  abstract lockMeeting(organizationId: string, id: string): Promise<boolean>;
}
