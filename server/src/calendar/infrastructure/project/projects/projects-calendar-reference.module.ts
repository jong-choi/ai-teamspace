import { Module } from '@nestjs/common';

import { CalendarProjectReferenceProvider } from '@/calendar/infrastructure/project/calendar-project-reference.provider';
import { ProjectsCalendarReferenceAdapter } from '@/calendar/infrastructure/project/projects/projects-calendar-reference.adapter';
import { ProjectsModule } from '@/projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [
    {
      provide: CalendarProjectReferenceProvider,
      useClass: ProjectsCalendarReferenceAdapter,
    },
  ],
  exports: [CalendarProjectReferenceProvider],
})
export class ProjectsCalendarReferenceModule {}
