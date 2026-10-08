import { Injectable } from '@nestjs/common';

import { CalendarReferenceLockRepository } from '@/calendar/infrastructure/persistence/calendar-reference-lock.repository';
import { meeting } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';
import { DatabaseService } from '@/database/database.service';

import { and, eq } from 'drizzle-orm';
@Injectable()
export class CalendarReferenceLockDrizzleRepository extends CalendarReferenceLockRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }
  async lockMeeting(organizationId: string, id: string) {
    const [row] = await this.database
      .requireTransaction()
      .select({ id: meeting.id })
      .from(meeting)
      .where(
        and(eq(meeting.organizationId, organizationId), eq(meeting.id, id)),
      )
      .for('share');
    return row !== undefined;
  }
}
