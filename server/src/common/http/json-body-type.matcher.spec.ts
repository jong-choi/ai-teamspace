import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';

import { createJsonBodyTypeMatcher } from '@/common/http/json-body-type.matcher';

function createRequest(url: string, contentType?: string): IncomingMessage {
  const request = new IncomingMessage(new Socket());
  request.url = url;
  if (contentType) request.headers['content-type'] = contentType;
  return request;
}

describe('전역 JSON body type matcher', () => {
  const matches = createJsonBodyTypeMatcher(['/mcp']);

  it('application/json 요청은 parameter와 대소문자에 관계없이 parser 대상이다', () => {
    expect(matches(createRequest('/organizations', 'application/json'))).toBe(
      true,
    );
    expect(
      matches(
        createRequest('/organizations', 'Application/JSON; charset=utf-8'),
      ),
    ).toBe(true);
  });

  it('raw body 경로는 query string이 있어도 parser 대상에서 제외한다', () => {
    expect(matches(createRequest('/mcp', 'application/json'))).toBe(false);
    expect(matches(createRequest('/mcp?trace=1', 'application/json'))).toBe(
      false,
    );
    expect(matches(createRequest('/mcp/other', 'application/json'))).toBe(true);
  });

  it('JSON이 아니거나 문법이 잘못된 Content-Type은 parser 대상이 아니다', () => {
    expect(matches(createRequest('/organizations'))).toBe(false);
    expect(matches(createRequest('/organizations', 'text/plain'))).toBe(false);
    expect(matches(createRequest('/organizations', 'not a mime'))).toBe(false);
  });
});
