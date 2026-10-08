// Enter는 전송, Shift(또는 Ctrl/Meta)+Enter는 줄바꿈이다. IME 조합 중 Enter는 글자 확정이므로 전송하지 않는다.
export function isAgentComposerSubmitKey(event: unknown): boolean {
  if (typeof event !== 'object' || event === null) return false;
  if (!('key' in event) || event.key !== 'Enter') return false;
  if (readFlag(event, 'shiftKey') || readFlag(event, 'ctrlKey')) return false;
  if (readFlag(event, 'metaKey') || readFlag(event, 'altKey')) return false;
  if (readFlag(event, 'isComposing')) return false;
  // 일부 브라우저는 IME 처리 중 keyCode 229를 보낸다.
  return !('keyCode' in event && event.keyCode === 229);
}

function readFlag(event: object, key: string): boolean {
  return key in event && Reflect.get(event, key) === true;
}
