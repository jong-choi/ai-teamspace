import { safeAgentIntegrationExternalText } from '@core/features/agent-integrations/agent-integrations-presentation';

import { describe, expect, test } from '@jest/globals';

describe('Agent integration 외부 문자열 표시', () => {
  test('control 문자와 bidi override/isolate를 제거한다', () => {
    expect(
      safeAgentIntegrationExternalText(
        'safe\u0000name\n\u202Eevil\u2066text\u2069',
        100,
      ),
    ).toBe('safe name eviltext');
  });

  test('서버가 준 긴 문자열은 표시 한도를 넘지 않는다', () => {
    expect(
      safeAgentIntegrationExternalText('x'.repeat(5000), 256),
    ).toHaveLength(256);
  });

  test('markdown/HTML처럼 보이는 문자열도 해석하지 않고 원문 text로 보존한다', () => {
    const input = '<script>alert(1)</script> [click](https://evil.example)';

    expect(safeAgentIntegrationExternalText(input, 4096)).toBe(input);
  });
});
