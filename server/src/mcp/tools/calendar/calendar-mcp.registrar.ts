import { Inject, Injectable } from '@nestjs/common';

import { CalendarAvailabilityService } from '@/calendar/calendar-availability.service';
import { CalendarMeetingQueryService } from '@/calendar/calendar-meeting-query.service';
import { CalendarParticipationService } from '@/calendar/calendar-participation.service';
import { CalendarSchedulingService } from '@/calendar/calendar-scheduling.service';
import { bindMcpTool, type BoundMcpTool } from '@/mcp/tools/bound-mcp-tool';
import {
  calendarAvailabilityCheckTool,
  calendarMeetingCancelTool,
  calendarMeetingCreateTool,
  calendarMeetingGetTool,
  calendarMeetingRescheduleTool,
  calendarMeetingRsvpTool,
  calendarMeetingsListTool,
} from '@/mcp/tools/calendar/calendar-tool-definitions';
import { toMcpOrganizationActor } from '@/mcp/tools/mcp-application-actor';
import {
  calendarMeetingReceipt,
  calendarMeetingRsvpReceipt,
} from '@/mcp/tools/mcp-mutation-receipt.mapper';

type CalendarQueryToolsService = Pick<
  CalendarMeetingQueryService,
  'listMeetings' | 'getMeeting'
>;

type CalendarAvailabilityToolsService = Pick<
  CalendarAvailabilityService,
  'previewAvailability'
>;

type CalendarSchedulingToolsService = Pick<
  CalendarSchedulingService,
  'createMeeting' | 'rescheduleMeeting' | 'cancelMeeting'
>;

type CalendarParticipationToolsService = Pick<
  CalendarParticipationService,
  'updateRsvp'
>;

@Injectable()
export class CalendarMcpRegistrar {
  constructor(
    @Inject(CalendarMeetingQueryService)
    private readonly queryService: CalendarQueryToolsService,
    @Inject(CalendarAvailabilityService)
    private readonly availabilityService: CalendarAvailabilityToolsService,
    @Inject(CalendarSchedulingService)
    private readonly schedulingService: CalendarSchedulingToolsService,
    @Inject(CalendarParticipationService)
    private readonly participationService: CalendarParticipationToolsService,
  ) {}

  tools(): BoundMcpTool[] {
    return [
      bindMcpTool(calendarMeetingsListTool, async (input, auth) => {
        const { organizationId, ...query } = input;
        return this.queryService.listMeetings(
          toMcpOrganizationActor(auth),
          organizationId,
          query,
        );
      }),
      bindMcpTool(calendarMeetingGetTool, async (input, auth) =>
        this.queryService.getMeeting(
          toMcpOrganizationActor(auth),
          input.organizationId,
          input.meetingId,
        ),
      ),
      bindMcpTool(calendarAvailabilityCheckTool, async (input, auth) => {
        const { organizationId, ...body } = input;
        return this.availabilityService.previewAvailability(
          toMcpOrganizationActor(auth),
          organizationId,
          body,
        );
      }),
      bindMcpTool(calendarMeetingCreateTool, async (input, auth) => {
        const { organizationId, ...body } = input;
        const result = await this.schedulingService.createMeeting(
          toMcpOrganizationActor(auth),
          organizationId,
          body,
        );
        return { result, mutation: calendarMeetingReceipt(result, 'created') };
      }),
      bindMcpTool(calendarMeetingRescheduleTool, async (input, auth) => {
        const { organizationId, meetingId, ...body } = input;
        const result = await this.schedulingService.rescheduleMeeting(
          toMcpOrganizationActor(auth),
          organizationId,
          meetingId,
          body,
        );
        return { result, mutation: calendarMeetingReceipt(result, 'updated') };
      }),
      bindMcpTool(calendarMeetingCancelTool, async (input, auth) => {
        const { organizationId, meetingId, ...body } = input;
        const result = await this.schedulingService.cancelMeeting(
          toMcpOrganizationActor(auth),
          organizationId,
          meetingId,
          body,
        );
        return {
          result,
          mutation: calendarMeetingReceipt(result, 'cancelled'),
        };
      }),
      bindMcpTool(calendarMeetingRsvpTool, async (input, auth) => {
        const { organizationId, meetingId, ...body } = input;
        const result = await this.participationService.updateRsvp(
          toMcpOrganizationActor(auth),
          organizationId,
          meetingId,
          body,
        );
        return { result, mutation: calendarMeetingRsvpReceipt(result) };
      }),
    ];
  }
}
