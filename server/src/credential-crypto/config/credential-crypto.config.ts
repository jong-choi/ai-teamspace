import { registerAs } from '@nestjs/config';

import type {
  CredentialCryptoConfig,
  CredentialEncryptionKey,
} from '@/credential-crypto/config/credential-crypto-config.type';
import validateConfig from '@/utils/validate-config';

import { z } from 'zod';

const keyIdSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
    'credential encryption key ID 형식이 올바르지 않습니다.',
  );

const keyRingSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value, context): CredentialEncryptionKey[] => {
    const keys: CredentialEncryptionKey[] = [];
    const seenKeyIds = new Set<string>();

    for (const entry of value.split(',')) {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex <= 0) {
        context.addIssue({
          code: 'custom',
          message:
            'CREDENTIAL_ENCRYPTION_KEYS 항목은 keyId=base64-key 형식이어야 합니다.',
        });
        return z.NEVER;
      }

      const idResult = keyIdSchema.safeParse(entry.slice(0, separatorIndex));
      if (!idResult.success) {
        context.addIssue({
          code: 'custom',
          message: idResult.error.issues[0]?.message ?? '잘못된 key ID입니다.',
        });
        return z.NEVER;
      }

      if (seenKeyIds.has(idResult.data)) {
        context.addIssue({
          code: 'custom',
          message: `중복 credential encryption key ID입니다: ${idResult.data}`,
        });
        return z.NEVER;
      }

      const keyBase64 = entry.slice(separatorIndex + 1).trim();
      const decoded = Buffer.from(keyBase64, 'base64');
      if (decoded.length !== 32 || decoded.toString('base64') !== keyBase64) {
        context.addIssue({
          code: 'custom',
          message:
            'credential encryption key는 canonical base64로 인코딩된 정확히 32바이트 값이어야 합니다.',
        });
        return z.NEVER;
      }

      seenKeyIds.add(idResult.data);
      keys.push({ id: idResult.data, keyBase64 });
    }

    return keys;
  });

const credentialCryptoConfigSchema = z
  .object({
    CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID: keyIdSchema,
    CREDENTIAL_ENCRYPTION_KEYS: keyRingSchema,
  })
  .superRefine((environment, context) => {
    if (
      !environment.CREDENTIAL_ENCRYPTION_KEYS.some(
        (key) => key.id === environment.CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID'],
        message: 'current credential encryption key가 key ring에 없습니다.',
      });
    }
  });

export default registerAs<CredentialCryptoConfig>('credentialCrypto', () => {
  const environment = validateConfig(process.env, credentialCryptoConfigSchema);

  return {
    currentKeyId: environment.CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID,
    keys: environment.CREDENTIAL_ENCRYPTION_KEYS,
  };
});
