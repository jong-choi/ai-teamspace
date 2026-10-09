export async function awaitOutboxPublish(
  operation: Promise<unknown>,
  signal: AbortSignal,
  codePrefix: string,
): Promise<void> {
  let onAbort = () => {};
  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error(`${codePrefix}_PUBLISH_ABORTED`));
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
      }),
    ]);
  } catch {
    // broker 주소·credential이 SDK 오류와 함께 영속 history에 남지 않게 고정 코드만 전달한다.
    throw new Error(
      `${codePrefix}_PUBLISH_${signal.aborted ? 'ABORTED' : 'FAILED'}`,
    );
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
