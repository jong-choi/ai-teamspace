import { z } from 'zod';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export const COLOR_THEME_PREFERENCES = [
  'default',
  'modern-minimal',
  'ocean-breeze',
  'terracotta',
  'amber-minimal',
  'bold-tech',
  'catppuccin',
  'cosmic-night',
  'doom-64',
  'elegant-luxury',
  'graphite',
  'kodama-grove',
  'nature',
  'perpetuity',
  'quantum-rose',
  'solar-dusk',
  'supabase',
  'tangerine',
  'random',
] as const;
export const FONT_SIZE_PREFERENCES = ['small', 'medium', 'large'] as const;
export const RADIUS_PREFERENCES = [
  'minimal',
  'small',
  'medium',
  'large',
] as const;

export const themePreferenceSchema = z.enum(THEME_PREFERENCES);
export const colorThemePreferenceSchema = z.enum(COLOR_THEME_PREFERENCES);
export const fontSizePreferenceSchema = z.enum(FONT_SIZE_PREFERENCES);
export const radiusPreferenceSchema = z.enum(RADIUS_PREFERENCES);

const hslChannelsSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)? \d+(?:\.\d+)?% \d+(?:\.\d+)?%$/);

export const themeColorTokensSchema = z.object({
  accent: hslChannelsSchema,
  accentForeground: hslChannelsSchema,
  background: hslChannelsSchema,
  border: hslChannelsSchema,
  card: hslChannelsSchema,
  cardForeground: hslChannelsSchema,
  chart1: hslChannelsSchema,
  chart2: hslChannelsSchema,
  chart3: hslChannelsSchema,
  chart4: hslChannelsSchema,
  chart5: hslChannelsSchema,
  destructive: hslChannelsSchema,
  destructiveForeground: hslChannelsSchema,
  foreground: hslChannelsSchema,
  input: hslChannelsSchema,
  muted: hslChannelsSchema,
  mutedForeground: hslChannelsSchema,
  popover: hslChannelsSchema,
  popoverForeground: hslChannelsSchema,
  primary: hslChannelsSchema,
  primaryForeground: hslChannelsSchema,
  ring: hslChannelsSchema,
  secondary: hslChannelsSchema,
  secondaryForeground: hslChannelsSchema,
});

export const DEFAULT_RANDOM_COLOR_THEME = {
  dark: {
    accent: '265 42% 24%',
    accentForeground: '0 0% 98%',
    background: '245 24% 8%',
    border: '245 18% 24%',
    card: '245 22% 12%',
    cardForeground: '245 15% 94%',
    chart1: '255 72% 64%',
    chart2: '305 68% 62%',
    chart3: '355 74% 60%',
    chart4: '45 78% 58%',
    chart5: '95 66% 56%',
    destructive: '0 72% 58%',
    destructiveForeground: '0 0% 100%',
    foreground: '245 15% 94%',
    input: '245 18% 24%',
    muted: '245 20% 16%',
    mutedForeground: '245 12% 68%',
    popover: '245 22% 12%',
    popoverForeground: '245 15% 94%',
    primary: '255 72% 64%',
    primaryForeground: '0 0% 0%',
    ring: '255 72% 64%',
    secondary: '245 20% 18%',
    secondaryForeground: '245 15% 90%',
  },
  light: {
    accent: '265 58% 91%',
    accentForeground: '265 36% 18%',
    background: '245 36% 98%',
    border: '245 20% 86%',
    card: '0 0% 100%',
    cardForeground: '245 28% 12%',
    chart1: '255 68% 48%',
    chart2: '305 64% 46%',
    chart3: '355 70% 48%',
    chart4: '45 74% 42%',
    chart5: '95 62% 38%',
    destructive: '0 72% 50%',
    destructiveForeground: '0 0% 100%',
    foreground: '245 28% 12%',
    input: '245 20% 82%',
    muted: '245 24% 94%',
    mutedForeground: '245 12% 42%',
    popover: '0 0% 100%',
    popoverForeground: '245 28% 12%',
    primary: '255 68% 48%',
    primaryForeground: '0 0% 100%',
    ring: '255 68% 48%',
    secondary: '245 28% 92%',
    secondaryForeground: '245 28% 16%',
  },
} as const;

export const randomColorThemeSchema = z.object({
  dark: themeColorTokensSchema,
  light: themeColorTokensSchema,
});

// 브라우저 저장소에 보관하는 화면 설정이다. 저장된 값은 이 schema로 다시 검증한다.
export const storedAppearanceSchema = z.object({
  colorThemePreference: colorThemePreferenceSchema.default('default'),
  fontSizePreference: fontSizePreferenceSchema.default('small'),
  randomColorTheme: randomColorThemeSchema.default(DEFAULT_RANDOM_COLOR_THEME),
  radiusPreference: radiusPreferenceSchema.default('medium'),
  themePreference: themePreferenceSchema.default('system'),
});

export type ColorThemePreference = z.output<typeof colorThemePreferenceSchema>;
export type FontSizePreference = z.output<typeof fontSizePreferenceSchema>;
export type RadiusPreference = z.output<typeof radiusPreferenceSchema>;
export type RandomColorTheme = z.output<typeof randomColorThemeSchema>;
export type ThemeColorTokens = z.output<typeof themeColorTokensSchema>;
export type ThemePreference = z.output<typeof themePreferenceSchema>;

export type StoredAppearance = z.output<typeof storedAppearanceSchema>;
