import { useEffect, useRef, useState } from 'react';

import { getProblemDetails } from '@repo/client/api-client/runtime';
import type { CalendarAvailabilityResponse } from '@repo/client/api-client/schemas';

type CalendarAvailabilityPreview<TInput> = (
  input: TInput,
) => Promise<CalendarAvailabilityResponse>;

export function useCalendarAvailability<TInput>({
  enabled,
  errorFallback,
  input,
  preview,
}: {
  enabled: boolean;
  errorFallback: string;
  input: TInput | null;
  preview: CalendarAvailabilityPreview<TInput>;
}) {
  const [result, setResult] = useState<CalendarAvailabilityResponse | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setResult(null);
    setErrorMessage(null);
    if (!enabled || !input) return;

    const timer = setTimeout(() => {
      void preview(input)
        .then((response) => {
          if (requestSequence.current === sequence) setResult(response);
        })
        .catch((error: unknown) => {
          if (requestSequence.current !== sequence) return;
          const problem = getProblemDetails(error);
          setErrorMessage(problem?.detail ?? errorFallback);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [enabled, errorFallback, input, preview]);

  return { errorMessage, result };
}
