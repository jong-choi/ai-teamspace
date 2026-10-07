import { projectAgentToolDisplay } from '@core/features/agent-chat/lib/agent-tool-display';

import { describe, expect, it } from '@jest/globals';

describe('Agent tool presentation', () => {
  it('canonical tool name을 사용자용 label로 바꾸고 raw name을 primary UI에 노출하지 않는다', () => {
    expect(
      projectAgentToolDisplay({
        name: 'wiki_document_update',
        args: { title: '운영 문서' },
        result: null,
      }),
    ).toMatchObject({
      label: '위키 문서 수정',
      fields: [{ label: '제목', value: '운영 문서' }],
    });
  });

  it('unknown external tool은 raw technical name 대신 generic label을 사용한다', () => {
    const display = projectAgentToolDisplay({
      name: 'evil_vendor_debug_dump',
      args: {},
      result: null,
    });

    expect(display.label).toBe('외부 도구 작업');
    expect(JSON.stringify(display)).not.toContain('evil_vendor_debug_dump');
  });

  it('credential/header/internal technical field는 allowlist 밖으로 숨긴다', () => {
    const display = projectAgentToolDisplay({
      name: 'chat_message_send',
      args: {
        message: '안녕하세요',
        authorization: 'Bearer secret',
        cookie: 'session=secret',
        token: 'raw-secret',
        organizationId: 'org-internal-id',
        mutationReceipt: 'technical',
      },
      result: null,
    });

    expect(display.fields).toEqual([{ label: '메시지', value: '안녕하세요' }]);
    expect(JSON.stringify(display)).not.toContain('raw-secret');
    expect(JSON.stringify(display)).not.toContain('org-internal-id');
    expect(JSON.stringify(display)).not.toContain('technical');
  });

  it('허용된 text 내부의 token-like 값도 redact하고 길이를 제한한다', () => {
    const display = projectAgentToolDisplay({
      name: 'wiki_search',
      args: {
        query: 'token=very-secret-value ' + 'x'.repeat(300),
      },
      result: 'authorization: abc123 ' + 'y'.repeat(400),
    });

    expect(display.fields[0]?.value).not.toContain('very-secret-value');
    expect(display.fields[0]?.value.length).toBeLessThanOrEqual(160);
    expect(display.resultSummary).not.toContain('abc123');
    expect(display.resultSummary?.length).toBeLessThanOrEqual(220);
  });

  it('복합 result를 raw JSON으로 dump하지 않고 safe summary/count만 표시한다', () => {
    const display = projectAgentToolDisplay({
      name: 'projects_list',
      args: {},
      result: {
        projects: [{ id: 'a' }, { id: 'b' }],
        credential: 'must-not-leak',
      },
    });

    expect(display.resultSummary).toBe('결과 2개');
    expect(JSON.stringify(display)).not.toContain('must-not-leak');
  });
});
