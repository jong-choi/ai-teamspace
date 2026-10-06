import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { CALENDAR_REMINDER_QUEUE } from '#server/calendar/domain/calendar-reminder.js';
import { BullMqCalendarReminderScheduler } from '#server/calendar/infrastructure/reminder/bullmq/bullmq-calendar-reminder.scheduler.js';
import { CalendarReminderScheduler } from '#server/calendar/infrastructure/reminder/calendar-reminder-scheduler.provider.js';
import { DatabaseModule } from '#server/database/database.module.js';
import { QueueModule } from '#server/queue/queue.module.js';

@Module({
  imports: [
    DatabaseModule,
    QueueModule.forProducer(),
    BullModule.registerQueue({ name: CALENDAR_REMINDER_QUEUE }),
  ],
  providers: [
    {
      provide: CalendarReminderScheduler,
      useClass: BullMqCalendarReminderScheduler,
    },
  ],
  exports: [CalendarReminderScheduler],
})
export class BullMqCalendarReminderModule {}
