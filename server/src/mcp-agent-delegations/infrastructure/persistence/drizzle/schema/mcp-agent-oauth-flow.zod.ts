import { CredentialCryptoEnvelopeSchema } from '@/credential-crypto/credential-crypto.provider';
import { McpScopesSchema } from '@/mcp/contracts/mcp-scope';
import { mcpAgentOauthFlow } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-oauth-flow.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

const fieldRefinements = {
  oauthClientIdentity: z.string().trim().min(1).max(256),
  issuer: z.url().nullable(),
  stateHash: z.string().regex(/^[a-f0-9]{64}$/u),
  requestedScopes: McpScopesSchema,
  resourceUrl: z.url(),
  redirectUrl: z.url(),
  returnTo: z.string().regex(/^\/ai(?:\/[A-Za-z0-9_-]+)?$/u),
  completionUrl: z.url(),
  verifierFormatVersion: z.number().int().positive().nullable(),
  verifierAlgorithm: CredentialCryptoEnvelopeSchema.shape.algorithm.nullable(),
  verifierKeyId: CredentialCryptoEnvelopeSchema.shape.keyId.nullable(),
  verifierNonce: CredentialCryptoEnvelopeSchema.shape.nonce.nullable(),
  verifierCiphertext:
    CredentialCryptoEnvelopeSchema.shape.ciphertext.nullable(),
  verifierAuthTag: CredentialCryptoEnvelopeSchema.shape.authTag.nullable(),
  discoveryFormatVersion: z.number().int().positive().nullable(),
  discoveryAlgorithm: CredentialCryptoEnvelopeSchema.shape.algorithm.nullable(),
  discoveryKeyId: CredentialCryptoEnvelopeSchema.shape.keyId.nullable(),
  discoveryNonce: CredentialCryptoEnvelopeSchema.shape.nonce.nullable(),
  discoveryCiphertext:
    CredentialCryptoEnvelopeSchema.shape.ciphertext.nullable(),
  discoveryAuthTag: CredentialCryptoEnvelopeSchema.shape.authTag.nullable(),
};

export const mcpAgentOauthFlowSelectSchema = createSelectSchema(
  mcpAgentOauthFlow,
  fieldRefinements,
);

export const mcpAgentOauthFlowInsertSchema = createInsertSchema(
  mcpAgentOauthFlow,
  {
    ...fieldRefinements,
    issuer: fieldRefinements.issuer.optional(),
    verifierFormatVersion: fieldRefinements.verifierFormatVersion.optional(),
    verifierAlgorithm: fieldRefinements.verifierAlgorithm.optional(),
    verifierKeyId: fieldRefinements.verifierKeyId.optional(),
    verifierNonce: fieldRefinements.verifierNonce.optional(),
    verifierCiphertext: fieldRefinements.verifierCiphertext.optional(),
    verifierAuthTag: fieldRefinements.verifierAuthTag.optional(),
    discoveryFormatVersion: fieldRefinements.discoveryFormatVersion.optional(),
    discoveryAlgorithm: fieldRefinements.discoveryAlgorithm.optional(),
    discoveryKeyId: fieldRefinements.discoveryKeyId.optional(),
    discoveryNonce: fieldRefinements.discoveryNonce.optional(),
    discoveryCiphertext: fieldRefinements.discoveryCiphertext.optional(),
    discoveryAuthTag: fieldRefinements.discoveryAuthTag.optional(),
  },
);

export const mcpAgentOauthFlowUpdateSchema = createUpdateSchema(
  mcpAgentOauthFlow,
  fieldRefinements,
).partial();

export const mcpAgentOauthFlowVerifierUpdateSchema =
  mcpAgentOauthFlowUpdateSchema
    .pick({
      verifierFormatVersion: true,
      verifierAlgorithm: true,
      verifierKeyId: true,
      verifierNonce: true,
      verifierCiphertext: true,
      verifierAuthTag: true,
    })
    .required();

export const mcpAgentOauthFlowDiscoveryUpdateSchema =
  mcpAgentOauthFlowUpdateSchema
    .pick({
      issuer: true,
      discoveryFormatVersion: true,
      discoveryAlgorithm: true,
      discoveryKeyId: true,
      discoveryNonce: true,
      discoveryCiphertext: true,
      discoveryAuthTag: true,
    })
    .required();
