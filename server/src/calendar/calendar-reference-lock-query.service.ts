import { Injectable } from '@nestjs/common';

import { CalendarReferenceLockRepository } from '@/calendar/infrastructure/persistence/calendar-reference-lock.repository';
@Injectable()
export class CalendarReferenceLockQueryService {
  constructor(private readonly repository: CalendarReferenceLockRepository) {}
  lockMeeting(organizationId: string, id: string) {
    return this.repository.lockMeeting(organizationId, id);
  }
}
