import { CredentialCryptoEnvelopeSchema } from '@/credential-crypto/credential-crypto.provider';
import { McpScopesSchema } from '@/mcp/contracts/mcp-scope';
import { mcpAgentDelegation } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-delegation.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

const fieldRefinements = {
  issuer: z.url(),
  resourceUrl: z.url(),
  oauthClientIdentity: z.string().trim().min(1).max(256),
  grantedScopes: McpScopesSchema,
  tokensFormatVersion: z.number().int().positive(),
  tokensAlgorithm: CredentialCryptoEnvelopeSchema.shape.algorithm,
  tokensKeyId: CredentialCryptoEnvelopeSchema.shape.keyId,
  tokensNonce: CredentialCryptoEnvelopeSchema.shape.nonce,
  tokensCiphertext: CredentialCryptoEnvelopeSchema.shape.ciphertext,
  tokensAuthTag: CredentialCryptoEnvelopeSchema.shape.authTag,
  revision: z.number().int().nonnegative(),
  refreshLeaseOwner: z.string().trim().min(1).max(128).nullable(),
};

export const mcpAgentDelegationSelectSchema = createSelectSchema(
  mcpAgentDelegation,
  fieldRefinements,
);

export const mcpAgentDelegationInsertSchema = createInsertSchema(
  mcpAgentDelegation,
  fieldRefinements,
);

export const mcpAgentDelegationUpdateSchema = createUpdateSchema(
  mcpAgentDelegation,
  fieldRefinements,
).partial();

export const mcpAgentDelegationTokenUpdateSchema =
  mcpAgentDelegationUpdateSchema
    .pick({
      grantedScopes: true,
      tokensFormatVersion: true,
      tokensAlgorithm: true,
      tokensKeyId: true,
      tokensNonce: true,
      tokensCiphertext: true,
      tokensAuthTag: true,
    })
    .required();
