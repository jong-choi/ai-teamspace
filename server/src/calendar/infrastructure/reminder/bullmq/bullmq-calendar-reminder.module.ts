import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { CALENDAR_REMINDER_QUEUE } from '@/calendar/domain/calendar-reminder';
import { BullMqCalendarReminderScheduler } from '@/calendar/infrastructure/reminder/bullmq/bullmq-calendar-reminder.scheduler';
import { CalendarReminderScheduler } from '@/calendar/infrastructure/reminder/calendar-reminder-scheduler.provider';
import { DatabaseModule } from '@/database/database.module';
import { QueueModule } from '@/queue/queue.module';

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
