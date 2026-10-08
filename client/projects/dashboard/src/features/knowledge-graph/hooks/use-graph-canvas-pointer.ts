import type { GraphPoint } from '@core/features/knowledge-graph/state/graph-studio-store';

export type GraphCanvasPointerHandlers = {
  onWheelZoom: (factor: number, focal: GraphPoint) => void;
  onKeyCommand: (command: 'zoom-in' | 'zoom-out' | 'reset' | 'fit') => void;
};

/** Native에는 wheel/하드웨어 키보드 확대가 없다. 확대는 pinch와 toolbar 버튼이 담당한다. */
export const useGraphCanvasPointer: (
  target: unknown,
  handlers: GraphCanvasPointerHandlers,
) => void = () => {};
