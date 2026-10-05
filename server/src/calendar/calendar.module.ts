import { Module } from '@nestjs/common';

import { AuthModule } from '#server/auth/auth.module.js';
import { CalendarController } from '#server/calendar/calendar.controller.js';
import { CalendarService } from '#server/calendar/calendar.service.js';
import { CalendarDrizzlePersistenceModule } from '#server/calendar/infrastructure/persistence/drizzle/drizzle-persistence.module.js';
import { UnavailableCalendarProjectReferenceModule } from '#server/calendar/infrastructure/project/unavailable/unavailable-calendar-project-reference.module.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import { OrganizationsModule } from '#server/organizations/organizations.module.js';

@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    CalendarDrizzlePersistenceModule,
    UnavailableCalendarProjectReferenceModule,
  ],
  controllers: [CalendarController],
  providers: [CalendarService, TrustedOriginGuard],
  exports: [CalendarService],
})
export class CalendarModule {}
