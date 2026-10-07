import { CredentialDecryptError } from '@/credential-crypto/credential-crypto.error';
import type { CredentialCryptoAssociatedData } from '@/credential-crypto/credential-crypto.provider';
import { NodeAesGcmCredentialCryptoAdapter } from '@/credential-crypto/node-aes-gcm/node-aes-gcm-credential-crypto.adapter';

describe('Node AES-GCM credential 암호화 adapter', () => {
  const keyA = Buffer.alloc(32, 11).toString('base64');
  const keyB = Buffer.alloc(32, 22).toString('base64');
  const associatedData: CredentialCryptoAssociatedData = {
    recordKind: 'mcp-agent-delegation',
    recordId: 'delegation_1',
    userId: 'user_1',
    organizationId: 'org_1',
    version: 1,
  };

  it('current key와 96-bit nonce로 암호화하고 round-trip한다', async () => {
    const adapter = new NodeAesGcmCredentialCryptoAdapter({
      currentKeyId: 'key-b',
      keys: [
        { id: 'key-a', keyBase64: keyA },
        { id: 'key-b', keyBase64: keyB },
      ],
    });

    const first = await adapter.encrypt('refresh-secret', associatedData);
    const second = await adapter.encrypt('refresh-secret', associatedData);

    expect(first).toMatchObject({
      version: 1,
      algorithm: 'aes-256-gcm',
      keyId: 'key-b',
    });
    expect(Buffer.from(first.nonce, 'base64')).toHaveLength(12);
    expect(first.nonce).not.toBe(second.nonce);
    await expect(adapter.decrypt(first, associatedData)).resolves.toBe(
      'refresh-secret',
    );
  });

  it('envelope keyId를 사용해 이전 key로 암호화한 값을 복호화한다', async () => {
    const previous = new NodeAesGcmCredentialCryptoAdapter({
      currentKeyId: 'key-a',
      keys: [
        { id: 'key-a', keyBase64: keyA },
        { id: 'key-b', keyBase64: keyB },
      ],
    });
    const envelope = await previous.encrypt('old-secret', associatedData);

    const rotated = new NodeAesGcmCredentialCryptoAdapter({
      currentKeyId: 'key-b',
      keys: [
        { id: 'key-a', keyBase64: keyA },
        { id: 'key-b', keyBase64: keyB },
      ],
    });

    await expect(rotated.decrypt(envelope, associatedData)).resolves.toBe(
      'old-secret',
    );
  });

  it('associated data가 달라지면 fail-closed한다', async () => {
    const adapter = new NodeAesGcmCredentialCryptoAdapter({
      currentKeyId: 'key-a',
      keys: [{ id: 'key-a', keyBase64: keyA }],
    });
    const envelope = await adapter.encrypt('bound-secret', associatedData);

    await expect(
      adapter.decrypt(envelope, {
        ...associatedData,
        organizationId: 'org_2',
      }),
    ).rejects.toBeInstanceOf(CredentialDecryptError);
  });

  it('ciphertext 변조를 generic decrypt failure로 처리한다', async () => {
    const adapter = new NodeAesGcmCredentialCryptoAdapter({
      currentKeyId: 'key-a',
      keys: [{ id: 'key-a', keyBase64: keyA }],
    });
    const envelope = await adapter.encrypt('sensitive-value', associatedData);
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    ciphertext[0] ^= 1;

    await expect(
      adapter.decrypt(
        {
          ...envelope,
          ciphertext: ciphertext.toString('base64'),
        },
        associatedData,
      ),
    ).rejects.toMatchObject({
      code: 'CREDENTIAL_DECRYPT_FAILED',
      message: 'credential을 복호화할 수 없습니다.',
    });
  });

  it('알 수 없는 envelope key를 generic decrypt failure로 처리한다', async () => {
    const adapter = new NodeAesGcmCredentialCryptoAdapter({
      currentKeyId: 'key-a',
      keys: [{ id: 'key-a', keyBase64: keyA }],
    });
    const envelope = await adapter.encrypt('secret', associatedData);

    await expect(
      adapter.decrypt({ ...envelope, keyId: 'removed-key' }, associatedData),
    ).rejects.toBeInstanceOf(CredentialDecryptError);
  });
});
