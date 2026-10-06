import {
  type ComponentProps,
  type ComponentRef,
  type ComponentType,
  createElement,
  forwardRef,
  type Ref,
  useEffect,
  useState,
} from 'react';
import { TextInput } from 'react-native';

import type LiveMarkdownTextInput from '@expensify/react-native-live-markdown/src/MarkdownTextInput';

export type { MarkdownRange } from '@expensify/react-native-live-markdown/src/commonTypes';
export type { MarkdownStyle } from '@expensify/react-native-live-markdown/src/MarkdownTextInput';

type ProductMarkdownTextInputProps = ComponentProps<
  typeof LiveMarkdownTextInput
>;

export type ProductMarkdownTextInputHandle = ComponentRef<
  typeof LiveMarkdownTextInput
>;

// 웹 구현은 모듈 평가 시 브라우저 전역을 참조하므로 첫 렌더 이후에 불러온다.
export const ProductMarkdownTextInput = forwardRef<
  ProductMarkdownTextInputHandle,
  ProductMarkdownTextInputProps
>(function ProductMarkdownTextInput(props, ref) {
  const [LiveInput, setLiveInput] = useState<ComponentType<
    ProductMarkdownTextInputProps & {
      ref?: Ref<ProductMarkdownTextInputHandle>;
    }
  > | null>(null);

  useEffect(() => {
    let active = true;

    // Root entry는 optional ExpensiMark parser도 평가하므로 input만 deep import한다.
    void import('@expensify/react-native-live-markdown/src/MarkdownTextInput').then(
      ({ default: input }) => {
        if (active) setLiveInput(() => input);
      },
    );

    return () => {
      active = false;
    };
  }, []);

  if (LiveInput) return createElement(LiveInput, { ...props, ref });

  const { markdownStyle, parser, ...inputProps } = props;
  void markdownStyle;
  void parser;
  return createElement(TextInput, {
    ...inputProps,
    ref: ref as Ref<ComponentRef<typeof TextInput>>,
  });
});
