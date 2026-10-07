import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import { CredentialCryptoProvider } from '@/credential-crypto/credential-crypto.provider';
import { NodeAesGcmCredentialCryptoAdapter } from '@/credential-crypto/node-aes-gcm/node-aes-gcm-credential-crypto.adapter';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CredentialCryptoProvider,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AllConfigType>) =>
        new NodeAesGcmCredentialCryptoAdapter(
          configService.getOrThrow('credentialCrypto', { infer: true }),
        ),
    },
  ],
  exports: [CredentialCryptoProvider],
})
export class NodeAesGcmCredentialCryptoModule {}
