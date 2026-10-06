import { Injectable } from '@nestjs/common';

import {
  CalendarParticipantConflictError,
  CalendarRoomConflictError,
} from '@/calendar/domain/calendar.error';
import type { CalendarSchedulingConflict } from '@/calendar/infrastructure/persistence/calendar-availability.repository';

@Injectable()
export class CalendarSchedulingConflictPolicy {
  throwConflict(conflict: CalendarSchedulingConflict): never {
    if (conflict.participantConflicts.length > 0) {
      throw new CalendarParticipantConflictError();
    }
    if (conflict.roomConflict) {
      throw new CalendarRoomConflictError();
    }
    throw new CalendarParticipantConflictError();
  }
}
