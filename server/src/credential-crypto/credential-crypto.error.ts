import { ApplicationError } from '@/application.error';

export class CredentialDecryptError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CREDENTIAL_DECRYPT_FAILED',
      'internal',
      'credential을 복호화할 수 없습니다.',
      options,
    );
  }
}
