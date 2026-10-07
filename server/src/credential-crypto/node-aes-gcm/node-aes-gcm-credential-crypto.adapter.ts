import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { CredentialCryptoConfig } from '@/credential-crypto/config/credential-crypto-config.type';
import { CredentialDecryptError } from '@/credential-crypto/credential-crypto.error';
import {
  type CredentialCryptoAssociatedData,
  CredentialCryptoAssociatedDataSchema,
  type CredentialCryptoEnvelope,
  CredentialCryptoEnvelopeSchema,
  CredentialCryptoProvider,
} from '@/credential-crypto/credential-crypto.provider';

const algorithm = 'aes-256-gcm';
const envelopeVersion = 1;

export class NodeAesGcmCredentialCryptoAdapter extends CredentialCryptoProvider {
  private readonly keys = new Map<string, Buffer>();

  constructor(private readonly config: CredentialCryptoConfig) {
    super();

    for (const key of config.keys) {
      this.keys.set(key.id, Buffer.from(key.keyBase64, 'base64'));
    }

    if (!this.keys.has(config.currentKeyId)) {
      throw new Error(
        'current credential encryption key가 key ring에 없습니다.',
      );
    }
  }

  async encrypt(
    plaintext: string,
    associatedData: CredentialCryptoAssociatedData,
  ): Promise<CredentialCryptoEnvelope> {
    const aad = this.serializeAssociatedData(associatedData);
    const nonce = randomBytes(12);
    const key = this.keys.get(this.config.currentKeyId);

    if (!key) {
      throw new Error('current credential encryption key를 찾을 수 없습니다.');
    }

    const cipher = createCipheriv(algorithm, key, nonce);
    cipher.setAAD(aad);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return CredentialCryptoEnvelopeSchema.parse({
      version: envelopeVersion,
      algorithm,
      keyId: this.config.currentKeyId,
      nonce: nonce.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    });
  }

  async decrypt(
    envelope: CredentialCryptoEnvelope,
    associatedData: CredentialCryptoAssociatedData,
  ): Promise<string> {
    try {
      const parsedEnvelope = CredentialCryptoEnvelopeSchema.parse(envelope);
      const key = this.keys.get(parsedEnvelope.keyId);
      if (!key) throw new Error('알 수 없는 credential encryption key입니다.');

      const decipher = createDecipheriv(
        algorithm,
        key,
        Buffer.from(parsedEnvelope.nonce, 'base64'),
      );
      decipher.setAAD(this.serializeAssociatedData(associatedData));
      decipher.setAuthTag(Buffer.from(parsedEnvelope.authTag, 'base64'));

      return Buffer.concat([
        decipher.update(Buffer.from(parsedEnvelope.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      if (error instanceof CredentialDecryptError) throw error;
      throw new CredentialDecryptError({ cause: error });
    }
  }

  private serializeAssociatedData(
    associatedData: CredentialCryptoAssociatedData,
  ): Buffer {
    const parsed = CredentialCryptoAssociatedDataSchema.parse(associatedData);

    return Buffer.from(
      JSON.stringify({
        recordKind: parsed.recordKind,
        recordId: parsed.recordId,
        userId: parsed.userId,
        organizationId: parsed.organizationId,
        version: parsed.version,
      }),
      'utf8',
    );
  }
}
