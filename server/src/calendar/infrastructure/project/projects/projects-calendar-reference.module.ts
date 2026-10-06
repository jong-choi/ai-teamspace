import { Module } from '@nestjs/common';

import { CalendarProjectReferenceProvider } from '#server/calendar/infrastructure/project/calendar-project-reference.provider.js';
import { ProjectsCalendarReferenceAdapter } from '#server/calendar/infrastructure/project/projects/projects-calendar-reference.adapter.js';
import { ProjectsModule } from '#server/projects/projects.module.js';

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
