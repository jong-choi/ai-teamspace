import { z } from 'zod';

const canonicalBase64Schema = z.string().min(1).refine((value) => {
  try {
    return Buffer.from(value, 'base64').toString('base64') === value;
  } catch {
    return false;
  }
}, 'canonical base64 형식이어야 합니다.');

export const CredentialCryptoAssociatedDataSchema = z.object({
  recordKind: z.string().trim().min(1).max(64),
  recordId: z.string().trim().min(1).max(256),
  userId: z.string().trim().min(1).max(256),
  organizationId: z.string().trim().min(1).max(256).nullable(),
  version: z.number().int().positive(),
});

export const CredentialCryptoEnvelopeSchema = z.object({
  version: z.literal(1),
  algorithm: z.literal('aes-256-gcm'),
  keyId: z.string().trim().min(1).max(64),
  nonce: canonicalBase64Schema.refine(
    (value) => Buffer.from(value, 'base64').length === 12,
    'AES-GCM nonce는 12바이트여야 합니다.',
  ),
  ciphertext: canonicalBase64Schema,
  authTag: canonicalBase64Schema.refine(
    (value) => Buffer.from(value, 'base64').length === 16,
    'AES-GCM auth tag는 16바이트여야 합니다.',
  ),
});

export type CredentialCryptoAssociatedData = z.infer<
  typeof CredentialCryptoAssociatedDataSchema
>;
export type CredentialCryptoEnvelope = z.infer<
  typeof CredentialCryptoEnvelopeSchema
>;

export abstract class CredentialCryptoProvider {
  abstract encrypt(
    plaintext: string,
    associatedData: CredentialCryptoAssociatedData,
  ): Promise<CredentialCryptoEnvelope>;

  abstract decrypt(
    envelope: CredentialCryptoEnvelope,
    associatedData: CredentialCryptoAssociatedData,
  ): Promise<string>;
}
