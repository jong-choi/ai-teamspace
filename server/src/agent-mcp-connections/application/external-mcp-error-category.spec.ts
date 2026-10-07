import { classifyExternalMcpError } from '@/agent-mcp-connections/application/external-mcp-error-category';

import {
  InsufficientScopeError,
  SdkError,
  SdkErrorCode,
  UnauthorizedError,
} from '@modelcontextprotocol/client';

describe('external MCP error category', () => {
  test.each([
    SdkErrorCode.RequestTimeout,
    SdkErrorCode.NotConnected,
    SdkErrorCode.ConnectionClosed,
    SdkErrorCode.SendFailed,
    SdkErrorCode.ClientHttpFailedToOpenStream,
  ])('%s는 connection unavailable로 분류한다', (code) => {
    expect(
      classifyExternalMcpError(new SdkError(code, 'untrusted detail')),
    ).toBe('connection_unavailable');
  });

  test('SDK 인증/권한 부족 오류는 authorization required로 분류한다', () => {
    expect(classifyExternalMcpError(new UnauthorizedError('untrusted'))).toBe(
      'authorization_required',
    );
    expect(
      classifyExternalMcpError(
        new InsufficientScopeError({ requiredScope: 'write:anything' }),
      ),
    ).toBe('authorization_required');
    expect(
      classifyExternalMcpError(
        new SdkError(SdkErrorCode.ClientHttpAuthentication, 'untrusted'),
      ),
    ).toBe('authorization_required');
  });

  test('protocol method incompatibility는 protocol incompatible로 분류한다', () => {
    expect(
      classifyExternalMcpError(
        new SdkError(
          SdkErrorCode.MethodNotSupportedByProtocolVersion,
          'untrusted',
        ),
      ),
    ).toBe('protocol_incompatible');
  });

  test('분류하지 못한 remote 오류는 세부 문자열과 무관하게 discovery failed다', () => {
    expect(
      classifyExternalMcpError(
        new Error('secret-like provider detail must not drive classification'),
      ),
    ).toBe('discovery_failed');
  });
});
