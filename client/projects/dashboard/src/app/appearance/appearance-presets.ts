import type {
  ColorThemePreference,
  FontSizePreference,
  RadiusPreference,
  ThemePreference,
} from '@core/app/appearance/appearance-schema';

// 색상 테마 이름, 최상위에 붙이는 class, 견본 색이다. class는 RNR appearance.css가 정의한다.
// random은 class 대신 계산한 CSS 변수를 직접 넣는다.
export const COLOR_THEME_OPTIONS = [
  {
    id: 'default',
    label: '기본',
    className: 'theme-default',
    preview: { dark: 'hsl(0 0% 89.8%)', light: 'hsl(0 0% 9%)' },
  },
  {
    id: 'modern-minimal',
    label: '모던 미니멀',
    className: 'theme-modern-minimal',
    preview: {
      dark: 'hsl(217.19 91.36% 59.41%)',
      light: 'hsl(217.19 91.36% 59.41%)',
    },
  },
  {
    id: 'ocean-breeze',
    label: '오션 브리즈',
    className: 'theme-ocean-breeze',
    preview: {
      dark: 'hsl(157.62 62.51% 52.34%)',
      light: 'hsl(141.69 68.59% 45.55%)',
    },
  },
  {
    id: 'terracotta',
    label: '테라코타',
    className: 'theme-terracotta',
    preview: {
      dark: 'hsl(14.77 62.2% 59.32%)',
      light: 'hsl(15.13 56.98% 52.62%)',
    },
  },
  {
    id: 'amber-minimal',
    label: '앰버',
    className: 'theme-amber-minimal',
    preview: {
      dark: 'hsl(36.29 90.5% 53.69%)',
      light: 'hsl(36.29 90.5% 53.69%)',
    },
  },
  {
    id: 'bold-tech',
    label: '볼드 테크',
    className: 'theme-bold-tech',
    preview: {
      dark: 'hsl(258.29 91.81% 66.9%)',
      light: 'hsl(258.29 91.81% 66.9%)',
    },
  },
  {
    id: 'catppuccin',
    label: '캣푸치노',
    className: 'theme-catppuccin',
    preview: {
      dark: 'hsl(267.43 86.56% 81.43%)',
      light: 'hsl(266.18 83.62% 57.35%)',
    },
  },
  {
    id: 'cosmic-night',
    label: '코스믹 나이트',
    className: 'theme-cosmic-night',
    preview: {
      dark: 'hsl(251.12 99.96% 78.36%)',
      light: 'hsl(252 55.87% 57.29%)',
    },
  },
  {
    id: 'doom-64',
    label: '둠 64',
    className: 'theme-doom-64',
    preview: {
      dark: 'hsl(1.33 77.99% 55.5%)',
      light: 'hsl(359.65 75.39% 40.9%)',
    },
  },
  {
    id: 'elegant-luxury',
    label: '엘레강스',
    className: 'theme-elegant-luxury',
    preview: {
      dark: 'hsl(0.35 72.36% 42.42%)',
      light: 'hsl(359.86 56.4% 39.56%)',
    },
  },
  {
    id: 'graphite',
    label: '그래파이트',
    className: 'theme-graphite',
    preview: { dark: 'hsl(0 0% 63.26%)', light: 'hsl(0 0% 37.75%)' },
  },
  {
    id: 'kodama-grove',
    label: '코다마 숲',
    className: 'theme-kodama-grove',
    preview: {
      dark: 'hsl(94.93 16.83% 55.49%)',
      light: 'hsl(72.1 35.19% 46.03%)',
    },
  },
  {
    id: 'nature',
    label: '네이처',
    className: 'theme-nature',
    preview: {
      dark: 'hsl(122.32 38.76% 49.09%)',
      light: 'hsl(122.69 43.81% 33.65%)',
    },
  },
  {
    id: 'perpetuity',
    label: '퍼페추이티',
    className: 'theme-perpetuity',
    preview: {
      dark: 'hsl(180.03 77.96% 59.07%)',
      light: 'hsl(184.38 70.51% 32.21%)',
    },
  },
  {
    id: 'quantum-rose',
    label: '퀀텀 로즈',
    className: 'theme-quantum-rose',
    preview: {
      dark: 'hsl(306.5 97.19% 70.45%)',
      light: 'hsl(329.4 91.53% 46.98%)',
    },
  },
  {
    id: 'solar-dusk',
    label: '솔라 더스크',
    className: 'theme-solar-dusk',
    preview: {
      dark: 'hsl(26.08 94.97% 50.18%)',
      light: 'hsl(27.04 99.37% 36.06%)',
    },
  },
  {
    id: 'supabase',
    label: '수파베이스',
    className: 'theme-supabase',
    preview: {
      dark: 'hsl(152.4 76.76% 21.83%)',
      light: 'hsl(151.38 65.59% 66.26%)',
    },
  },
  {
    id: 'tangerine',
    label: '탠저린',
    className: 'theme-tangerine',
    preview: {
      dark: 'hsl(13.18 72.31% 55.05%)',
      light: 'hsl(13.18 72.31% 55.05%)',
    },
  },
  {
    id: 'random',
    label: '랜덤',
    className: 'theme-random',
    preview: { dark: 'hsl(255 72% 64%)', light: 'hsl(255 68% 48%)' },
  },
] as const satisfies readonly {
  id: ColorThemePreference;
  label: string;
  className: string;
  preview: { dark: string; light: string };
}[];

export const THEME_MODE_OPTIONS = [
  { id: 'system', label: '시스템' },
  { id: 'light', label: '라이트' },
  { id: 'dark', label: '다크' },
] as const satisfies readonly { id: ThemePreference; label: string }[];

export const FONT_SIZE_OPTIONS = [
  { id: 'small', label: '작게', className: 'font-size-small' },
  { id: 'medium', label: '보통', className: 'font-size-medium' },
  { id: 'large', label: '크게', className: 'font-size-large' },
] as const satisfies readonly {
  id: FontSizePreference;
  label: string;
  className: string;
}[];

export const RADIUS_OPTIONS = [
  { id: 'minimal', label: '최소', className: 'radius-minimal' },
  { id: 'small', label: '작게', className: 'radius-small' },
  { id: 'medium', label: '보통', className: 'radius-medium' },
  { id: 'large', label: '크게', className: 'radius-large' },
] as const satisfies readonly {
  id: RadiusPreference;
  label: string;
  className: string;
}[];

// 최상위 요소에서 이전 설정의 class를 지울 때 쓰는 전체 목록이다.
export const APPEARANCE_ROOT_CLASS_NAMES: readonly string[] = [
  ...COLOR_THEME_OPTIONS.map(({ className }) => className),
  ...FONT_SIZE_OPTIONS.map(({ className }) => className),
  ...RADIUS_OPTIONS.map(({ className }) => className),
];
