// DialogContent의 너비 preset이다. Web의 Radix 래퍼는 폭을 갖지 않아 max-w만으로는 내용 크기대로 줄어들고,
// 접두사 없는 max-w는 RNR 기본값 sm:max-w-lg에 가려진다. 그래서 sm:max-w와 web 전용 width를 함께 준다.
export const DIALOG_WIDTH = {
  sm: 'sm:max-w-sm web:w-[min(24rem,calc(100vw-2rem))]',
  md: 'sm:max-w-md web:w-[min(28rem,calc(100vw-2rem))]',
  lg: 'sm:max-w-lg web:w-[min(32rem,calc(100vw-2rem))]',
  xl: 'sm:max-w-xl web:w-[min(36rem,calc(100vw-2rem))]',
  '3xl': 'sm:max-w-3xl web:w-[min(48rem,calc(100vw-2rem))]',
  '4xl': 'sm:max-w-4xl web:w-[min(56rem,calc(100vw-2rem))]',
} as const;
