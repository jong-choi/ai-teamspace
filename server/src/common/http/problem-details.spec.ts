import { Logger } from '@nestjs/common';

import { problemDetailsOptions } from '#server/common/http/problem-details.js';
import { OrganizationProviderFailureError } from '#server/organizations/domain/organization.error.js';

import { ProblemDetailsFactory } from '@camcima/nestjs-rfc9457';
import { vi } from 'vitest';

describe('공용 오류 진단', () => {
  it('공급자 장애는 원인의 종류와 작업 정보를 기록하고 원문은 숨긴다', () => {
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    try {
      const factory = new ProblemDetailsFactory(problemDetailsOptions);
      const result = factory.create(
        new OrganizationProviderFailureError({
          cause: new TypeError('민감한 내부 값'),
        }),
        { url: '/organizations', method: 'POST' },
      );
      expect(result.status).toBe(502);
      expect(result.body.detail).toBeUndefined();
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
});
