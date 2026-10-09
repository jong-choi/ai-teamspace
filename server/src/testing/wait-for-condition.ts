export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  message: string,
  options: {
    timeoutMs?: number;
    pause?: () => Promise<void>;
  } = {},
): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? 5_000);
  const pause =
    options.pause ??
    (() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

  while (Date.now() < deadline) {
    if (await condition()) return;
    await pause();
  }
  throw new Error(message);
}
