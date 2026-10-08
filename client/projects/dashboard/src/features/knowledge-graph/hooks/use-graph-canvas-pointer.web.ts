import { useEffect } from 'react';

// 타입 계약은 native 파일이 소유하고 Web 구현이 같은 public contract를 따른다.
import type { GraphCanvasPointerHandlers } from '@core/features/knowledge-graph/hooks/use-graph-canvas-pointer';

const WHEEL_ZOOM_IN = 1.08;
const WHEEL_ZOOM_OUT = 0.92;

/** Web의 wheel/trackpad pinch와 키보드 +/−/0/f 확대를 캔버스에 연결한다. */
export function useGraphCanvasPointer(
  target: unknown,
  { onKeyCommand, onWheelZoom }: GraphCanvasPointerHandlers,
) {
  useEffect(() => {
    if (!(target instanceof HTMLElement)) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = target.getBoundingClientRect();
      onWheelZoom(event.deltaY < 0 ? WHEEL_ZOOM_IN : WHEEL_ZOOM_OUT, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const element = event.target;
      if (
        element instanceof HTMLElement &&
        (element.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName))
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const command =
        event.key === '+' || event.key === '='
          ? 'zoom-in'
          : event.key === '-'
            ? 'zoom-out'
            : event.key === '0'
              ? 'reset'
              : event.key === 'f'
                ? 'fit'
                : null;
      if (!command) return;
      event.preventDefault();
      onKeyCommand(command);
    };

    target.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      target.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onKeyCommand, onWheelZoom, target]);
}
