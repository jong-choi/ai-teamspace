import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind.config의 사용자 정의 글자 크기를 알려 줘야 text-2xs·text-3xs가 색상 class와 섞이지 않고 다른 글자 크기와만 충돌한다.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['2xs', '3xs'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
