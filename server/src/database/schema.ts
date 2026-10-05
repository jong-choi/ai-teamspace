import * as authSchema from '#server/auth/infrastructure/persistence/drizzle/generated/auth.schema.js';
import * as chatConversationSchema from '#server/chat/infrastructure/persistence/drizzle/schema/chat-conversation.schema.js';
import * as chatMessageSchema from '#server/chat/infrastructure/persistence/drizzle/schema/chat-message.schema.js';
import * as chatParticipantSchema from '#server/chat/infrastructure/persistence/drizzle/schema/chat-participant.schema.js';
import * as projectSchema from '#server/projects/infrastructure/persistence/drizzle/schema/project.schema.js';
import * as projectColumnSchema from '#server/projects/infrastructure/persistence/drizzle/schema/project-column.schema.js';
import * as ticketSchema from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.schema.js';
import * as wikiCollectionSchema from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-collection.schema.js';
import * as wikiDocumentSchema from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema.js';
import * as wikiDocumentRevisionSchema from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision.schema.js';
import * as wikiDocumentRevisionCollaboratorSchema from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision-collaborator.schema.js';

export const databaseSchema = {
  ...authSchema,
  ...chatConversationSchema,
  ...chatMessageSchema,
  ...chatParticipantSchema,
  ...projectColumnSchema,
  ...projectSchema,
  ...ticketSchema,
  ...wikiCollectionSchema,
  ...wikiDocumentSchema,
  ...wikiDocumentRevisionSchema,
  ...wikiDocumentRevisionCollaboratorSchema,
};
