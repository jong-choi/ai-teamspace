import type { ComponentRef } from 'react';

import LiveMarkdownTextInput from '@expensify/react-native-live-markdown/src/MarkdownTextInput';

// Root entry는 optional ExpensiMark parser도 평가하므로 Wiki 전용 adapter만 deep import한다.
export type { MarkdownRange } from '@expensify/react-native-live-markdown/src/commonTypes';
export type { MarkdownStyle } from '@expensify/react-native-live-markdown/src/MarkdownTextInput';
export const MarkdownTextInput = LiveMarkdownTextInput;
export type MarkdownTextInputHandle = ComponentRef<
  typeof LiveMarkdownTextInput
>;
