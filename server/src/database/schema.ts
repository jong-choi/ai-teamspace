import * as agentMcpConnectionSchema from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.schema';
import * as agentMcpConnectionToolSchema from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection-tool.schema';
import * as agentMcpCredentialSchema from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-credential.schema';
import * as agentMcpOauthStateSchema from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-oauth-state.schema';
import * as authSchema from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import * as meetingSchema from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';
import * as meetingAttendeeSchema from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.schema';
import * as meetingRecurrenceSeriesSchema from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.schema';
import * as meetingRoomSchema from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-room.schema';
import * as chatConversationSchema from '@/chat/infrastructure/persistence/drizzle/schema/chat-conversation.schema';
import * as chatMessageSchema from '@/chat/infrastructure/persistence/drizzle/schema/chat-message.schema';
import * as chatParticipantSchema from '@/chat/infrastructure/persistence/drizzle/schema/chat-participant.schema';
import * as mcpOrganizationPolicySchema from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-organization-policy.schema';
import * as mcpUserPolicySchema from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-user-policy.schema';
import * as projectSchema from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import * as projectColumnSchema from '@/projects/infrastructure/persistence/drizzle/schema/project-column.schema';
import * as ticketSchema from '@/projects/infrastructure/persistence/drizzle/schema/ticket.schema';
import * as ticketChecklistSchema from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.schema';
import * as ticketChecklistItemSchema from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.schema';
import * as ticketCommentSchema from '@/projects/infrastructure/persistence/drizzle/schema/ticket-comment.schema';
import * as ticketLabelSchema from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label.schema';
import * as ticketLabelAssignmentSchema from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label-assignment.schema';
import * as wikiCollectionSchema from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-collection.schema';
import * as wikiDocumentSchema from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';
import * as wikiDocumentRevisionSchema from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision.schema';
import * as wikiDocumentRevisionCollaboratorSchema from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision-collaborator.schema';

export const databaseSchema = {
  ...agentMcpConnectionSchema,
  ...agentMcpConnectionToolSchema,
  ...agentMcpCredentialSchema,
  ...agentMcpOauthStateSchema,
  ...authSchema,
  ...meetingAttendeeSchema,
  ...meetingRecurrenceSeriesSchema,
  ...meetingRoomSchema,
  ...meetingSchema,
  ...chatConversationSchema,
  ...chatMessageSchema,
  ...chatParticipantSchema,
  ...mcpOrganizationPolicySchema,
  ...mcpUserPolicySchema,
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
