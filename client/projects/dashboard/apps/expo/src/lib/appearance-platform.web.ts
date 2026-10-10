import type { AppearanceRootSync } from '@core/app/appearance/appearance-provider';
import type { AppearanceStorage } from '@core/app/appearance/appearance-store';
import { APPEARANCE_TOKEN_VARIABLES } from '@core/app/appearance/appearance-tokens';

const DARK_MODE_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export const appearanceStorage: AppearanceStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};

// 문서 최상위(html)에 테마 class와 CSS 변수를 맞춘다. portal로 그려지는 dialog도 같은 테마를 따른다.
export const syncAppearanceRoot: AppearanceRootSync = ({
  classNames,
  removableClassNames,
  removableVariables,
  themePreference,
  variables,
}) => {
  const root = document.documentElement;
  const dark =
    themePreference === 'dark' ||
    (themePreference === 'system' &&
      window.matchMedia(DARK_MODE_MEDIA_QUERY).matches);

  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.classList.remove(...removableClassNames);
  root.classList.add(...classNames);
  for (const variable of removableVariables) {
    root.style.removeProperty(variable);
  }
  for (const [variable, value] of Object.entries(variables)) {
    root.style.setProperty(variable, value);
  }

  // class와 변수를 바꾼 직후의 계산된 값을 읽는다. SVG와 마크다운이 이 값을 쓴다.
  const computed = window.getComputedStyle(root);
  const read = (variable: string) =>
    `hsl(${computed.getPropertyValue(variable).trim()})`;
  return {
    background: read(APPEARANCE_TOKEN_VARIABLES.background),
    border: read(APPEARANCE_TOKEN_VARIABLES.border),
    foreground: read(APPEARANCE_TOKEN_VARIABLES.foreground),
    input: read(APPEARANCE_TOKEN_VARIABLES.input),
    muted: read(APPEARANCE_TOKEN_VARIABLES.muted),
    mutedForeground: read(APPEARANCE_TOKEN_VARIABLES.mutedForeground),
    primary: read(APPEARANCE_TOKEN_VARIABLES.primary),
    ring: read(APPEARANCE_TOKEN_VARIABLES.ring),
  };
};
