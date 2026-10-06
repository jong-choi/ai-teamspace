import * as authSchema from '#server/auth/infrastructure/persistence/drizzle/generated/auth.schema.js';
import * as meetingSchema from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting.schema.js';
import * as meetingAttendeeSchema from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.schema.js';
import * as meetingRecurrenceSeriesSchema from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.schema.js';
import * as meetingRoomSchema from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-room.schema.js';
import * as chatConversationSchema from '#server/chat/infrastructure/persistence/drizzle/schema/chat-conversation.schema.js';
import * as chatMessageSchema from '#server/chat/infrastructure/persistence/drizzle/schema/chat-message.schema.js';
import * as chatParticipantSchema from '#server/chat/infrastructure/persistence/drizzle/schema/chat-participant.schema.js';
import * as projectSchema from '#server/projects/infrastructure/persistence/drizzle/schema/project.schema.js';
import * as projectColumnSchema from '#server/projects/infrastructure/persistence/drizzle/schema/project-column.schema.js';
import * as ticketSchema from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.schema.js';
import * as ticketChecklistSchema from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.schema.js';
import * as ticketChecklistItemSchema from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.schema.js';
import * as ticketCommentSchema from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-comment.schema.js';
import * as ticketLabelSchema from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-label.schema.js';
import * as ticketLabelAssignmentSchema from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-label-assignment.schema.js';
import * as wikiCollectionSchema from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-collection.schema.js';
import * as wikiDocumentSchema from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema.js';
import * as wikiDocumentRevisionSchema from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision.schema.js';
import * as wikiDocumentRevisionCollaboratorSchema from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision-collaborator.schema.js';

export const databaseSchema = {
  ...authSchema,
  ...meetingAttendeeSchema,
  ...meetingRecurrenceSeriesSchema,
  ...meetingRoomSchema,
  ...meetingSchema,
  ...chatConversationSchema,
  ...chatMessageSchema,
  ...chatParticipantSchema,
  ...projectColumnSchema,
  ...projectSchema,
  ...ticketChecklistItemSchema,
  ...ticketChecklistSchema,
  ...ticketCommentSchema,
  ...ticketLabelAssignmentSchema,
  ...ticketLabelSchema,
  ...ticketSchema,
  ...wikiCollectionSchema,
  ...wikiDocumentSchema,
  ...wikiDocumentRevisionSchema,
  ...wikiDocumentRevisionCollaboratorSchema,
};
