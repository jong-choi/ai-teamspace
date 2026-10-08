import { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

const GRID_SIZE = 24;

/** graph.html의 24px dot grid를 SVG Pattern과 theme border 색으로 그린다. */
export function GraphCanvasGrid({ color }: { color: string }) {
  const patternId = `graph-grid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // Web의 react-native-svg는 퍼센트 크기를 svg 속성으로 남기지 않아 측정한 숫자 크기를 넘긴다.
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <View
      onLayout={({ nativeEvent }) =>
        setSize({
          width: nativeEvent.layout.width,
          height: nativeEvent.layout.height,
        })
      }
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      {size.width > 0 && size.height > 0 ? (
        <Svg height={size.height} width={size.width}>
          <Defs>
            <Pattern
              height={GRID_SIZE}
              id={patternId}
              patternUnits="userSpaceOnUse"
              width={GRID_SIZE}
            >
              <Circle cx={1} cy={1} fill={color} r={1} />
            </Pattern>
          </Defs>
          <Rect
            fill={`url(#${patternId})`}
            height={size.height}
            width={size.width}
          />
        </Svg>
      ) : null}
    </View>
  );
}
