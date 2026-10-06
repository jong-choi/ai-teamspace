import { Inject, Injectable, Logger } from '@nestjs/common';

import { CalendarMeetingLoader } from '@/calendar/calendar-meeting.loader';
import { CalendarMeetingPolicy } from '@/calendar/calendar-meeting.policy';
import { CalendarMeetingPresenterService } from '@/calendar/calendar-meeting-presenter.service';
import { CalendarMeetingNotFoundError } from '@/calendar/domain/calendar.error';
import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingDetailResponse } from '@/calendar/dto/meeting.dto';
import type { UpdateMeetingInput } from '@/calendar/dto/update-meeting.dto';
import type {
  UpdateMeetingAgendaInput,
  UpdateMeetingNotesInput,
} from '@/calendar/dto/update-meeting-content.dto';
import { MeetingContentRepository } from '@/calendar/infrastructure/persistence/meeting-content.repository';
import { CalendarProjectReferenceProvider } from '@/calendar/infrastructure/project/calendar-project-reference.provider';
import { CalendarReminderScheduler } from '@/calendar/infrastructure/reminder/calendar-reminder-scheduler.provider';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';

type CalendarOrganizationsAccess = Pick<OrganizationsService, 'getDetail'>;

type CalendarMeetingPresenter = Pick<
  CalendarMeetingPresenterService,
  'presentDetail'
>;

@Injectable()
export class CalendarMeetingContentService {
  private readonly logger = new Logger(CalendarMeetingContentService.name);

  constructor(
    private readonly meetingContentRepository: MeetingContentRepository,
    @Inject(CalendarMeetingLoader)
    private readonly meetingLoader: Pick<
      CalendarMeetingLoader,
      'requireMeeting'
    >,
    private readonly meetingPolicy: CalendarMeetingPolicy,
    @Inject(CalendarMeetingPresenterService)
    private readonly presenter: CalendarMeetingPresenter,
    private readonly projectReferenceProvider: CalendarProjectReferenceProvider,
    private readonly reminderScheduler: CalendarReminderScheduler,
    @Inject(OrganizationsService)
    private readonly organizationsService: CalendarOrganizationsAccess,
  ) {}

  async updateMeeting(
    context: OrganizationActorContext,
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    input: UpdateMeetingInput,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const current = await this.meetingLoader.requireMeeting(
      organizationId,
      meetingId,
    );
    this.meetingPolicy.assertActive(current);
    await this.meetingPolicy.assertModificationAccess(
      context,
      organizationId,
      current,
    );

    const changes: UpdateMeetingInput = {};
    if (input.title !== undefined && input.title !== current.meeting.title) {
      changes.title = input.title;
    }
    if (
      input.category !== undefined &&
      input.category !== current.meeting.category
    ) {
      changes.category = input.category;
    }
    if (
      input.projectId !== undefined &&
      input.projectId !== current.meeting.projectId
    ) {
      if (input.projectId !== null) {
        await this.projectReferenceProvider.assertReference(
          organizationId,
          input.projectId,
        );
      }
      changes.projectId = input.projectId;
    }
    if (
      input.reminderMinutes !== undefined &&
      input.reminderMinutes !== current.meeting.reminderMinutes
    ) {
      changes.reminderMinutes = input.reminderMinutes;
    }
    if (Object.keys(changes).length === 0) {
      return this.presenter.presentDetail(organizationId, current);
    }

    const updated = await this.meetingContentRepository.editMeetingDetails(
      organizationId,
      meetingId,
      changes,
    );
    if (!updated) throw new CalendarMeetingNotFoundError();
    if (changes.reminderMinutes !== undefined) {
      await this.syncReminder(updated.meeting);
    }
    return this.presenter.presentDetail(organizationId, updated);
  }

  async updateAgenda(
    context: OrganizationActorContext,
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    input: UpdateMeetingAgendaInput,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const current = await this.meetingLoader.requireMeeting(
      organizationId,
      meetingId,
    );
    this.meetingPolicy.assertActive(current);
    await this.meetingPolicy.assertModificationAccess(
      context,
      organizationId,
      current,
    );
    if (input.agendaMarkdown === current.meeting.agendaMarkdown) {
      return this.presenter.presentDetail(organizationId, current);
    }
    const updated = await this.meetingContentRepository.updateMeetingAgenda(
      organizationId,
      meetingId,
      input,
    );
    if (!updated) throw new CalendarMeetingNotFoundError();
    return this.presenter.presentDetail(organizationId, updated);
  }

  async updateNotes(
    context: OrganizationActorContext,
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    input: UpdateMeetingNotesInput,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const current = await this.meetingLoader.requireMeeting(
      organizationId,
      meetingId,
    );
    this.meetingPolicy.assertActive(current);
    await this.meetingPolicy.assertModificationAccess(
      context,
      organizationId,
      current,
    );
    if (input.notesMarkdown === current.meeting.notesMarkdown) {
      return this.presenter.presentDetail(organizationId, current);
    }
    const updated = await this.meetingContentRepository.updateMeetingNotes(
      organizationId,
      meetingId,
      input,
    );
    if (!updated) throw new CalendarMeetingNotFoundError();
    return this.presenter.presentDetail(organizationId, updated);
  }

  private async syncReminder(meeting: Meeting): Promise<void> {
    try {
      await this.reminderScheduler.sync([meeting]);
    } catch (error) {
      this.logger.error(
        'Meeting은 저장되었지만 reminder queue 동기화에 실패했습니다.',
        error,
      );
    }
  }
}
