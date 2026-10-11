import { isGraphBubbleUp } from '@langchain/langgraph';
import { modelRetryMiddleware } from 'langchain';
import { z } from 'zod';

const MAX_CAUSE_DEPTH = 8;

const modelFailureSchema = z.looseObject({
  name: z.string().optional(),
  message: z.string().optional(),
  status_code: z.number().optional(),
  status: z.number().optional(),
  cause: z.unknown().optional(),
});

/**
 * 모델 호출 실패를 다시 시도할지 정한다.
 * Ollama는 스트림 도중의 서버 오류를 상태 코드 없는 일반 Error로 던지므로,
 * 다시 해도 결과가 같은 경우(취소, 4xx 요청 오류)만 빼고 재시도한다.
 */
export function isRetryableModelFailure(error: unknown): boolean {
  if (isGraphBubbleUp(error)) return false;

  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    const parsed = modelFailureSchema.safeParse(current);
    if (!parsed.success) break;
    const failure = parsed.data;

    if (failure.name === 'AbortError' || failure.message === 'Aborted') {
      return false;
    }
    const status = failure.status_code ?? failure.status;
    if (status !== undefined) {
      return status === 408 || status === 429 || status >= 500;
    }
    // 안쪽 middleware를 거친 오류는 MiddlewareError로 감싸져 cause에 원본이 있다.
    current = failure.cause;
  }
  return true;
}

/**
 * 일시적인 모델 호출 실패를 1, 2, 4, 8, 16초 간격으로 다섯 번까지 다시 시도한다.
 * 모델 호출 단계만 다시 하므로 이미 실행된 도구는 다시 실행되지 않는다.
 * 끝내 실패하면 오류를 답변처럼 대화에 남기지 않고 실행을 실패로 끝낸다.
 */
export const transientModelRetryMiddleware = modelRetryMiddleware({
  maxRetries: 5,
  initialDelayMs: 1_000,
  backoffFactor: 2,
  jitter: true,
  retryOn: isRetryableModelFailure,
  onFailure: 'error',
});
