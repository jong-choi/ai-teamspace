import { agentMcpOauthState } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-oauth-state.schema';
import { CredentialCryptoEnvelopeSchema } from '@/credential-crypto/credential-crypto.provider';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

const fieldRefinements = {
  stateHash: z.string().regex(/^[a-f0-9]{64}$/u),
  resourceIdentity: z.url(),
  authorizationServer: z.url().nullable(),
  redirectUri: z.url(),
  verifierFormatVersion: z.number().int().positive().nullable(),
  verifierAlgorithm: CredentialCryptoEnvelopeSchema.shape.algorithm.nullable(),
  verifierKeyId: CredentialCryptoEnvelopeSchema.shape.keyId.nullable(),
  verifierNonce: CredentialCryptoEnvelopeSchema.shape.nonce.nullable(),
  verifierCiphertext:
    CredentialCryptoEnvelopeSchema.shape.ciphertext.nullable(),
  verifierAuthTag: CredentialCryptoEnvelopeSchema.shape.authTag.nullable(),
  discoveryFormatVersion: z.number().int().positive().nullable(),
  discoveryAlgorithm:
    CredentialCryptoEnvelopeSchema.shape.algorithm.nullable(),
  discoveryKeyId: CredentialCryptoEnvelopeSchema.shape.keyId.nullable(),
  discoveryNonce: CredentialCryptoEnvelopeSchema.shape.nonce.nullable(),
  discoveryCiphertext:
    CredentialCryptoEnvelopeSchema.shape.ciphertext.nullable(),
  discoveryAuthTag: CredentialCryptoEnvelopeSchema.shape.authTag.nullable(),
};

export const agentMcpOauthStateSelectSchema = createSelectSchema(
  agentMcpOauthState,
  fieldRefinements,
);

export const agentMcpOauthStateInsertSchema = createInsertSchema(
  agentMcpOauthState,
  {
    ...fieldRefinements,
    authorizationServer: fieldRefinements.authorizationServer.optional(),
    verifierFormatVersion:
      fieldRefinements.verifierFormatVersion.optional(),
    verifierAlgorithm: fieldRefinements.verifierAlgorithm.optional(),
    verifierKeyId: fieldRefinements.verifierKeyId.optional(),
    verifierNonce: fieldRefinements.verifierNonce.optional(),
    verifierCiphertext: fieldRefinements.verifierCiphertext.optional(),
    verifierAuthTag: fieldRefinements.verifierAuthTag.optional(),
    discoveryFormatVersion:
      fieldRefinements.discoveryFormatVersion.optional(),
    discoveryAlgorithm: fieldRefinements.discoveryAlgorithm.optional(),
    discoveryKeyId: fieldRefinements.discoveryKeyId.optional(),
    discoveryNonce: fieldRefinements.discoveryNonce.optional(),
    discoveryCiphertext:
      fieldRefinements.discoveryCiphertext.optional(),
    discoveryAuthTag: fieldRefinements.discoveryAuthTag.optional(),
  },
);

export const agentMcpOauthStateUpdateSchema = createUpdateSchema(
  agentMcpOauthState,
  fieldRefinements,
).partial();

export const agentMcpOauthStateVerifierUpdateSchema =
  agentMcpOauthStateUpdateSchema
    .pick({
      verifierFormatVersion: true,
      verifierAlgorithm: true,
      verifierKeyId: true,
      verifierNonce: true,
      verifierCiphertext: true,
      verifierAuthTag: true,
    })
    .required();

export const agentMcpOauthStateDiscoveryUpdateSchema =
  agentMcpOauthStateUpdateSchema
    .pick({
      authorizationServer: true,
      discoveryFormatVersion: true,
      discoveryAlgorithm: true,
      discoveryKeyId: true,
      discoveryNonce: true,
      discoveryCiphertext: true,
      discoveryAuthTag: true,
    })
    .required();
