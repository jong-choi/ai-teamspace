import {
  FONT_SIZE_PREFERENCES,
  type FontSizePreference,
  RADIUS_PREFERENCES,
  type RadiusPreference,
  type RandomColorTheme,
  type ThemeColorTokens,
} from '@core/app/appearance/appearance-schema';

const THEME_TOKEN_CSS_NAMES = {
  accent: '--accent',
  accentForeground: '--accent-foreground',
  background: '--background',
  border: '--border',
  card: '--card',
  cardForeground: '--card-foreground',
  chart1: '--chart-1',
  chart2: '--chart-2',
  chart3: '--chart-3',
  chart4: '--chart-4',
  chart5: '--chart-5',
  destructive: '--destructive',
  destructiveForeground: '--destructive-foreground',
  foreground: '--foreground',
  input: '--input',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  popover: '--popover',
  popoverForeground: '--popover-foreground',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  ring: '--ring',
  secondary: '--secondary',
  secondaryForeground: '--secondary-foreground',
} as const satisfies Record<keyof ThemeColorTokens, `--${string}`>;

export const THEME_TOKEN_CSS_VARIABLES = Object.values(THEME_TOKEN_CSS_NAMES);

const formatHsl = (hue: number, saturation: number, lightness: number) =>
  `${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%`;

const hueOffset = (hue: number, offset: number) => (hue + offset + 360) % 360;

const hslToRgb = (hue: number, saturation: number, lightness: number) => {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = hue / 60;
  const component = chroma * (1 - Math.abs((section % 2) - 1));
  const [red, green, blue] =
    section < 1
      ? [chroma, component, 0]
      : section < 2
        ? [component, chroma, 0]
        : section < 3
          ? [0, chroma, component]
          : section < 4
            ? [0, component, chroma]
            : section < 5
              ? [component, 0, chroma]
              : [chroma, 0, component];
  const offset = l - chroma / 2;

  return [red + offset, green + offset, blue + offset] as const;
};

const relativeLuminance = (
  hue: number,
  saturation: number,
  lightness: number,
) => {
  const linearize = (channel: number) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const [red, green, blue] = hslToRgb(hue, saturation, lightness);

  return (
    linearize(red) * 0.2126 +
    linearize(green) * 0.7152 +
    linearize(blue) * 0.0722
  );
};

const chooseReadableForeground = (
  hue: number,
  saturation: number,
  lightness: number,
) => {
  const luminance = relativeLuminance(hue, saturation, lightness);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const blackContrast = (luminance + 0.05) / 0.05;

  return whiteContrast >= blackContrast ? '0 0% 100%' : '0 0% 0%';
};

export const getHslContrastRatio = (first: string, second: string) => {
  const toLuminance = (value: string) => {
    const [hue = 0, saturation = 0, lightness = 0] = value
      .replaceAll('%', '')
      .split(' ')
      .map(Number);

    return relativeLuminance(hue, saturation, lightness);
  };
  const firstLuminance = toLuminance(first);
  const secondLuminance = toLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
};

const pick = <Value>(values: readonly Value[], random: () => number): Value =>
  values[
    Math.min(Math.floor(random() * values.length), values.length - 1)
  ] as Value;

export const createRandomColorTheme = (
  random: () => number = Math.random,
): RandomColorTheme => {
  const hue = Math.floor(random() * 360);
  const accentHue = hueOffset(hue, 45 + Math.floor(random() * 271));
  const saturation = 55 + Math.floor(random() * 36);
  const lightPrimaryLightness = 38 + Math.floor(random() * 21);
  const darkPrimaryLightness = 56 + Math.floor(random() * 20);
  const lightAccentLightness = 86 + Math.floor(random() * 9);
  const darkAccentLightness = 22 + Math.floor(random() * 18);
  const lightPrimary = formatHsl(hue, saturation, lightPrimaryLightness);
  const darkPrimary = formatHsl(hue, saturation, darkPrimaryLightness);
  const lightAccent = formatHsl(
    accentHue,
    Math.max(40, saturation - 10),
    lightAccentLightness,
  );
  const darkAccent = formatHsl(
    accentHue,
    Math.max(35, saturation - 20),
    darkAccentLightness,
  );

  return {
    dark: {
      accent: darkAccent,
      accentForeground: chooseReadableForeground(
        accentHue,
        Math.max(35, saturation - 20),
        darkAccentLightness,
      ),
      background: formatHsl(hue, 24, 8),
      border: formatHsl(hue, 18, 24),
      card: formatHsl(hue, 22, 12),
      cardForeground: formatHsl(hue, 15, 94),
      chart1: darkPrimary,
      chart2: formatHsl(hueOffset(hue, 55), saturation, 62),
      chart3: formatHsl(hueOffset(hue, 110), saturation, 60),
      chart4: formatHsl(hueOffset(hue, 180), saturation, 58),
      chart5: formatHsl(hueOffset(hue, 250), saturation, 60),
      destructive: '0 72% 58%',
      destructiveForeground: '0 0% 100%',
      foreground: formatHsl(hue, 15, 94),
      input: formatHsl(hue, 18, 24),
      muted: formatHsl(hue, 20, 16),
      mutedForeground: formatHsl(hue, 12, 68),
      popover: formatHsl(hue, 22, 12),
      popoverForeground: formatHsl(hue, 15, 94),
      primary: darkPrimary,
      primaryForeground: chooseReadableForeground(
        hue,
        saturation,
        darkPrimaryLightness,
      ),
      ring: darkPrimary,
      secondary: formatHsl(hue, 20, 18),
      secondaryForeground: formatHsl(hue, 15, 90),
    },
    light: {
      accent: lightAccent,
      accentForeground: chooseReadableForeground(
        accentHue,
        Math.max(40, saturation - 10),
        lightAccentLightness,
      ),
      background: formatHsl(hue, 36, 98),
      border: formatHsl(hue, 20, 86),
      card: '0 0% 100%',
      cardForeground: formatHsl(hue, 28, 12),
      chart1: lightPrimary,
      chart2: formatHsl(hueOffset(hue, 55), saturation, 46),
      chart3: formatHsl(hueOffset(hue, 110), saturation, 44),
      chart4: formatHsl(hueOffset(hue, 180), saturation, 42),
      chart5: formatHsl(hueOffset(hue, 250), saturation, 44),
      destructive: '0 72% 50%',
      destructiveForeground: '0 0% 100%',
      foreground: formatHsl(hue, 28, 12),
      input: formatHsl(hue, 20, 82),
      muted: formatHsl(hue, 24, 94),
      mutedForeground: formatHsl(hue, 12, 42),
      popover: '0 0% 100%',
      popoverForeground: formatHsl(hue, 28, 12),
      primary: lightPrimary,
      primaryForeground: chooseReadableForeground(
        hue,
        saturation,
        lightPrimaryLightness,
      ),
      ring: lightPrimary,
      secondary: formatHsl(hue, 28, 92),
      secondaryForeground: formatHsl(hue, 28, 16),
    },
  };
};

export const createRandomAppearance = (
  random: () => number = Math.random,
): {
  colorTheme: RandomColorTheme;
  fontSizePreference: FontSizePreference;
  radiusPreference: RadiusPreference;
} => ({
  colorTheme: createRandomColorTheme(random),
  fontSizePreference: pick(FONT_SIZE_PREFERENCES, random),
  radiusPreference: pick(RADIUS_PREFERENCES, random),
});

export const toThemeCssVariables = (tokens: ThemeColorTokens) =>
  Object.fromEntries(
    Object.entries(THEME_TOKEN_CSS_NAMES).map(([key, cssName]) => [
      cssName,
      tokens[key as keyof ThemeColorTokens],
    ]),
  ) as Record<`--${string}`, string>;
