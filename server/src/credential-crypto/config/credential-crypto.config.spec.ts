import credentialCryptoConfig from '@/credential-crypto/config/credential-crypto.config';

describe('credential crypto 설정', () => {
  const originalEnvironment = process.env;
  const keyA = Buffer.alloc(32, 1).toString('base64');
  const keyB = Buffer.alloc(32, 2).toString('base64');

  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID: 'key-b',
      CREDENTIAL_ENCRYPTION_KEYS: `key-a=${keyA},key-b=${keyB}`,
    };
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('검증된 current key와 key ring을 반환한다', () => {
    expect(credentialCryptoConfig()).toEqual({
      currentKeyId: 'key-b',
      keys: [
        { id: 'key-a', keyBase64: keyA },
        { id: 'key-b', keyBase64: keyB },
      ],
    });
  });

  it('중복 key ID를 거부한다', () => {
    process.env.CREDENTIAL_ENCRYPTION_KEYS = `key-a=${keyA},key-a=${keyB}`;

    expect(() => credentialCryptoConfig()).toThrow(
      '중복 credential encryption key ID입니다: key-a',
    );
  });

  it('current key가 ring에 없으면 거부한다', () => {
    process.env.CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID = 'missing';

    expect(() => credentialCryptoConfig()).toThrow(
      'current credential encryption key가 key ring에 없습니다.',
    );
  });

  it('32바이트가 아닌 key를 거부한다', () => {
    process.env.CREDENTIAL_ENCRYPTION_KEYS = `key-a=${Buffer.alloc(16).toString('base64')}`;
    process.env.CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID = 'key-a';

    expect(() => credentialCryptoConfig()).toThrow(
      'credential encryption key는 canonical base64로 인코딩된 정확히 32바이트 값이어야 합니다.',
    );
  });

  it('안전하지 않은 key ID를 거부한다', () => {
    process.env.CREDENTIAL_ENCRYPTION_KEYS = `bad key=${keyA}`;
    process.env.CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID = 'bad key';

    expect(() => credentialCryptoConfig()).toThrow(
      'credential encryption key ID 형식이 올바르지 않습니다.',
    );
  });
});
