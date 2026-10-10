import { created, ignored } from '#seed/api.ts';
import type { SeedContext } from '#seed/context.ts';
import { DEMO_TIME_ZONE } from '#seed/relative-time.ts';
import type { CalendarFile } from '#seed/source.ts';

const MINUTE_MS = 60 * 1000;

export async function seedCalendar(input: {
  administratorUsername: string;
  context: SeedContext;
  file: CalendarFile;
  organizationId: string;
  projectIds: ReadonlyMap<string, string>;
}): Promise<void> {
  const { context, file } = input;
  const base = `/organizations/${input.organizationId}/calendar`;
  const administrator = context.session(input.administratorUsername);

  const roomIds = new Map<string, string>();
  for (const room of file.rooms) {
    const createdRoom = await administrator.post(
      `${base}/rooms`,
      room,
      created,
    );
    roomIds.set(room.name, createdRoom.id);
  }

  for (const meeting of file.meetings) {
    const subject = `회의 "${meeting.title}"`;
    const startAt = context.clock.resolve(meeting.startAt);
    const endAt = new Date(
      startAt.getTime() + meeting.durationMinutes * MINUTE_MS,
    );
    const meetingRoomId = meeting.room ? roomIds.get(meeting.room) : undefined;
    if (meeting.room && !meetingRoomId) {
      throw new Error(`없는 회의실입니다: ${subject} → ${meeting.room}`);
    }
    const projectId = meeting.project
      ? input.projectIds.get(meeting.project)
      : undefined;
    if (meeting.project && !projectId) {
      throw new Error(`없는 프로젝트입니다: ${subject} → ${meeting.project}`);
    }

    let createdMeeting;
    try {
      createdMeeting = await context.session(meeting.organizer).post(
        `${base}/meetings`,
        {
          title: meeting.title,
          category: meeting.category,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          timeZone: DEMO_TIME_ZONE,
          locationType: meeting.locationType,
          meetingRoomId,
          locationText: meeting.locationText,
          projectId,
          attendeeUserIds: meeting.attendees.map((name) =>
            context.userId(name),
          ),
          agendaMarkdown: meeting.agenda,
          notesMarkdown: meeting.notes,
          recurrence: meeting.repeatWeeks
            ? {
                frequency: 'weekly',
                interval: 1,
                count: meeting.repeatWeeks,
                byWeekday: [],
                timeZone: DEMO_TIME_ZONE,
              }
            : undefined,
        },
        created,
      );
    } catch (error) {
      throw new Error(`${subject}을(를) 만들지 못했습니다.`, { cause: error });
    }

    for (const [attendee, status] of Object.entries(meeting.rsvp)) {
      await context
        .session(attendee)
        .put(`${base}/meetings/${createdMeeting.id}/rsvp`, { status }, ignored);
    }
  }
  console.log(
    `회의실 ${file.rooms.length}개와 회의 ${file.meetings.length}건을 넣었습니다.`,
  );
}
