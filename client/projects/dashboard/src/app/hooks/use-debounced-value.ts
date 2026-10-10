import { useEffect, useState } from 'react';

// 입력이 멈춘 뒤 delayMs가 지나야 값이 바뀐다. 자동완성 검색처럼 글자마다 요청하면 안 되는 곳에 쓴다.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}
