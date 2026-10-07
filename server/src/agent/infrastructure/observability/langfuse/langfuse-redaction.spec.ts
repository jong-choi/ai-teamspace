import {
  pseudonymizeLangfuseId,
  redactLangfuseValue,
} from '@/agent/infrastructure/observability/langfuse/langfuse-redaction';

describe('Langfuse redaction', () => {
  it('중첩된 credential key와 inline token을 제거한다', () => {
    const sanitized = redactLangfuseValue({
      authorization: 'Bearer top-secret',
      user_id: 'raw-user-123',
      organizationId: 'raw-org-123',
      nested: {
        refresh_token: 'refresh-secret',
        ordinary:
          'authorization=Bearer-secret cookie=session-secret api_key=test-key',
      },
    });

    expect(sanitized).toEqual({
      authorization: '[REDACTED]',
      user_id: '[REDACTED]',
      organizationId: '[REDACTED]',
      nested: {
        refresh_token: '[REDACTED]',
        ordinary:
          'authorization=[REDACTED] cookie=[REDACTED] api_key=[REDACTED]',
      },
    });
  });

  it('serialized JSON metadata 안의 identity와 credential도 제거한다', () => {
    expect(
      redactLangfuseValue(
        JSON.stringify({
          user_id: 'raw-user',
          organizationId: 'raw-org',
          nested: { access_token: 'token-secret' },
        }),
      ),
    ).toBe(
      JSON.stringify({
        user_id: '[REDACTED]',
        organizationId: '[REDACTED]',
        nested: { access_token: '[REDACTED]' },
      }),
    );
  });

  it('URL의 userinfo, query, fragment를 trace 전에 제거한다', () => {
    expect(
      redactLangfuseValue(
        'provider=https://user:pass@example.com/mcp?access_token=secret#debug',
      ),
    ).toBe('provider=https://example.com/mcp');
  });

  it('순환 객체와 크기 제한을 안전하게 처리한다', () => {
    const input: Record<string, unknown> = {
      first: '123456789',
      items: [1, 2, 3],
    };
    input.self = input;

    expect(
      redactLangfuseValue(input, {
        maxArrayLength: 2,
        maxObjectKeys: 3,
        maxStringLength: 4,
      }),
    ).toEqual({
      first: '1234[TRUNCATED]',
      items: [1, 2, '[TRUNCATED]'],
      self: '[CIRCULAR]',
    });
  });

  it('동일 식별자는 같은 pseudonym으로 만들고 raw 식별자는 노출하지 않는다', () => {
    const secret = '0123456789abcdef0123456789abcdef';
    const first = pseudonymizeLangfuseId('user-123', secret);
    const second = pseudonymizeLangfuseId('user-123', secret);

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    expect(first).not.toContain('user-123');
    expect(pseudonymizeLangfuseId('user-456', secret)).not.toBe(first);
  });
});
