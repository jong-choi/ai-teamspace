import { agentMcpCredential } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-credential.schema';
import { CredentialCryptoEnvelopeSchema } from '@/credential-crypto/credential-crypto.provider';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

const envelopeRefinements = {
  algorithm: CredentialCryptoEnvelopeSchema.shape.algorithm,
  keyId: CredentialCryptoEnvelopeSchema.shape.keyId,
  nonce: CredentialCryptoEnvelopeSchema.shape.nonce,
  ciphertext: CredentialCryptoEnvelopeSchema.shape.ciphertext,
  authTag: CredentialCryptoEnvelopeSchema.shape.authTag,
};

export const agentMcpCredentialSelectSchema = createSelectSchema(
  agentMcpCredential,
  envelopeRefinements,
);

export const agentMcpCredentialInsertSchema = createInsertSchema(
  agentMcpCredential,
  envelopeRefinements,
);

export const agentMcpCredentialUpdateSchema = createUpdateSchema(
  agentMcpCredential,
  envelopeRefinements,
).partial();
