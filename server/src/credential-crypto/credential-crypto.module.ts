import { Module } from '@nestjs/common';

import { NodeAesGcmCredentialCryptoModule } from '@/credential-crypto/node-aes-gcm/node-aes-gcm-credential-crypto.module';

@Module({
  imports: [NodeAesGcmCredentialCryptoModule],
  exports: [NodeAesGcmCredentialCryptoModule],
})
export class CredentialCryptoModule {}
