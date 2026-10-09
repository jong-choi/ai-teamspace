import type { ArgumentsHost } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';

import { ApplicationError } from '@/application.error';
import { CalendarIcsGenerationError } from '@/calendar/domain/calendar.error';
import { ProblemDetailsFilter } from '@/common/http/problem-details.filter';
import { CuratedGraphRevisionConflictError } from '@/knowledge-graph/domain/curated-graph.error';
import {
  OrganizationNotFoundError,
  OrganizationProviderFailureError,
} from '@/organizations/domain/organization.error';

import { jest } from '@jest/globals';
import {
  HttpExceptionFilter,
  PROBLEM_CONTENT_TYPE,
} from 'nest-problem-details-filter';

function createFixture() {
  const response = {};
  const reply = jest.fn();
  const setHeader = jest.fn();
  const httpAdapterHost = {
    httpAdapter: { reply, setHeader },
  } as unknown as HttpAdapterHost;
  const delegate = new HttpExceptionFilter(
    httpAdapterHost,
    '',
    undefined,
    ({ status }) => status >= 500,
    true,
  );
  const filter = new ProblemDetailsFilter(delegate, httpAdapterHost);
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { filter, host, reply, response, setHeader };
}

describe('공용 Problem Details 처리', () => {
  it('application error를 RFC 9457 응답으로 변환한다', () => {
    const { filter, host, reply, response, setHeader } = createFixture();

    filter.catch(new OrganizationNotFoundError(), host);

    expect(setHeader).toHaveBeenCalledWith(
      response,
      'Content-Type',
      PROBLEM_CONTENT_TYPE,
    );
    expect(reply).toHaveBeenCalledWith(
      response,
      {
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: '조직을 찾을 수 없습니다.',
        errorCode: 'ORGANIZATION_NOT_FOUND',
      },
      404,
    );
  });

  it('로컬 처리 실패는 500 Problem Details로 변환한다', () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    try {
      const { filter, host, reply, response } = createFixture();

      filter.catch(new CalendarIcsGenerationError(), host);

      expect(reply).toHaveBeenCalledWith(
        response,
        {
          type: 'about:blank',
          title: 'Internal Server Error',
          status: 500,
          errorCode: 'CALENDAR_ICS_GENERATION_FAILED',
        },
        500,
      );
    } finally {
      log.mockRestore();
    }
  });

  it('5xx detail은 숨기고 원문 없이 진단 정보만 기록한다', () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    try {
      const { filter, host, reply, response } = createFixture();

      filter.catch(
        new OrganizationProviderFailureError({
          cause: new TypeError('민감한 내부 값'),
        }),
        host,
      );

      expect(reply).toHaveBeenCalledWith(
        response,
        {
          type: 'about:blank',
          title: 'Bad Gateway',
          status: 502,
          errorCode: 'ORGANIZATION_PROVIDER_FAILURE',
        },
        502,
      );
      expect(log).toHaveBeenCalledWith({
        code: 'ORGANIZATION_PROVIDER_FAILURE',
        status: 502,
        operation: 'POST',
        cause: 'TypeError',
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain('민감한 내부 값');
    } finally {
      log.mockRestore();
    }
  });

  it('body parser의 노출 가능한 4xx 오류는 원래 status로 응답한다', () => {
    const { filter, host, reply, response } = createFixture();
    // body-parser가 limit 초과 시 던지는 http-errors 형식이다.
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
      type: 'entity.too.large',
    });

    filter.catch(tooLarge, host);

    expect(reply).toHaveBeenCalledWith(
      response,
      {
        type: 'about:blank',
        title: 'Payload Too Large',
        status: 413,
        detail: 'request entity too large',
      },
      413,
    );
  });

  it('rate limit 오류는 429와 Retry-After를 함께 반환한다', () => {
    const { filter, host, reply, response, setHeader } = createFixture();

    filter.catch(
      new ApplicationError(
        'KG_RATE_LIMITED',
        'rate_limited',
        '요청 한도를 초과했습니다.',
        { retryAfterSeconds: 1.2 },
      ),
      host,
    );

    expect(setHeader).toHaveBeenCalledWith(response, 'Retry-After', '2');
    expect(reply.mock.calls[0]?.[2]).toBe(429);
  });

  it('curated 충돌 오류를 공용 Problem Details로 변환한다', () => {
    const { filter, host, reply } = createFixture();

    filter.catch(new CuratedGraphRevisionConflictError(), host);

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 409,
        errorCode: 'KG_CURATED_REVISION_CONFLICT',
      }),
      409,
    );
  });

  it('노출 표시가 없거나 5xx인 status 오류는 500으로 숨긴다', () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    try {
      const { filter, host, reply } = createFixture();

      filter.catch(
        Object.assign(new Error('내부 상세'), { status: 413, expose: false }),
        host,
      );
      filter.catch(
        Object.assign(new Error('내부 상세'), { status: 503, expose: true }),
        host,
      );

      expect(reply.mock.calls.map((call) => call[2])).toEqual([500, 500]);
      expect(JSON.stringify(reply.mock.calls)).not.toContain('내부 상세');
    } finally {
      log.mockRestore();
    }
  });
});
