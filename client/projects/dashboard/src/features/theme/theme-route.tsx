import { type ReactNode, useEffect } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  COLOR_THEME_OPTIONS,
  FONT_SIZE_OPTIONS,
  RADIUS_OPTIONS,
  THEME_MODE_OPTIONS,
} from '@core/app/appearance/appearance-presets';
import { useAppearanceStore } from '@core/app/appearance/appearance-provider';
import { createRandomAppearance } from '@core/app/appearance/appearance-random';
import {
  DEFAULT_APPEARANCE,
  isSameAppearance,
} from '@core/app/appearance/appearance-store';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { ChoiceChip } from '@core/app/ui/choice-chip';
import { SettingsRouteFrame } from '@core/features/settings/settings-route-frame';

import {
  type LucideIcon,
  Palette,
  RotateCcw,
  Shuffle,
  SquareRoundCorner,
  SunMoon,
  Type,
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

export function ThemeRoute() {
  return (
    <SettingsRouteFrame activeTab="theme" userContent={() => <ThemePage />} />
  );
}

function ThemePage() {
  const { notifySuccess } = useDashboardPlatform();
  const { colorScheme } = useColorScheme();
  const applied = useAppearanceStore((state) => state.applied);
  const saved = useAppearanceStore((state) => state.saved);
  const preview = useAppearanceStore((state) => state.preview);
  const revert = useAppearanceStore((state) => state.revert);
  const save = useAppearanceStore((state) => state.save);
  const dark = colorScheme === 'dark';

  // 고르는 동안은 화면에 미리 적용만 한다. 저장하지 않고 탭을 떠나면 저장된 설정으로 되돌린다.
  useEffect(() => revert, [revert]);

  const randomize = () => {
    const random = createRandomAppearance();
    preview({
      colorThemePreference: 'random',
      fontSizePreference: random.fontSizePreference,
      radiusPreference: random.radiusPreference,
      randomColorTheme: random.colorTheme,
    });
  };

  const saveAppearance = () => {
    if (isSameAppearance(applied, saved)) {
      notifySuccess({ title: '변경 사항이 없습니다' });
      return;
    }
    save();
    notifySuccess({ title: '테마를 저장했습니다.' });
  };

  return (
    <ScrollView className="min-h-0 flex-1" showsVerticalScrollIndicator={false}>
      <View className="mx-auto w-full max-w-7xl gap-3 p-4 sm:p-6 lg:p-8">
        <View className="overflow-hidden rounded-lg border border-border">
          <ThemeRow icon={SunMoon} label="화면 모드">
            {THEME_MODE_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.id}
                label={option.label}
                onPress={() => preview({ themePreference: option.id })}
                selected={applied.themePreference === option.id}
              />
            ))}
          </ThemeRow>
          <ThemeRow icon={Palette} label="색상">
            {COLOR_THEME_OPTIONS.filter((option) => option.id !== 'random').map(
              (option) => (
                <ChoiceChip
                  key={option.id}
                  label={option.label}
                  leading={
                    <View
                      className="size-3 rounded-full border border-border"
                      style={{
                        backgroundColor: dark
                          ? option.preview.dark
                          : option.preview.light,
                      }}
                    />
                  }
                  onPress={() => preview({ colorThemePreference: option.id })}
                  selected={applied.colorThemePreference === option.id}
                />
              ),
            )}
          </ThemeRow>
          <ThemeRow icon={Type} label="글자 크기">
            {FONT_SIZE_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.id}
                label={option.label}
                onPress={() => preview({ fontSizePreference: option.id })}
                selected={applied.fontSizePreference === option.id}
              />
            ))}
          </ThemeRow>
          <ThemeRow icon={SquareRoundCorner} label="모서리">
            {RADIUS_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.id}
                label={option.label}
                onPress={() => preview({ radiusPreference: option.id })}
                selected={applied.radiusPreference === option.id}
              />
            ))}
          </ThemeRow>
          <ThemeRow icon={Shuffle} label="랜덤">
            <Button onPress={randomize} size="sm" variant="outline">
              <Icon as={Shuffle} className="size-3.5" />
              <Text className="text-xs">랜덤 테마</Text>
            </Button>
            {applied.colorThemePreference === 'random' ? (
              <Text className="text-xs text-muted-foreground">
                랜덤 색상 적용 중
              </Text>
            ) : null}
          </ThemeRow>
        </View>

        <View className="flex-row justify-end gap-2">
          <Button
            onPress={() => preview(DEFAULT_APPEARANCE)}
            size="sm"
            variant="outline"
          >
            <Icon as={RotateCcw} className="size-3.5" />
            <Text className="text-xs">기본 테마</Text>
          </Button>
          <Button onPress={saveAppearance} size="sm">
            <Text className="text-xs text-primary-foreground">저장</Text>
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}

function ThemeRow({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <View className="min-h-11 flex-row items-start gap-3 border-t border-border/70 px-3 py-2 first:border-t-0">
      <View className="w-24 shrink-0 flex-row items-center gap-1.5 pt-2">
        <Icon as={icon} className="size-3.5 text-muted-foreground" />
        <Text className="text-xs font-medium">{label}</Text>
      </View>
      <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-2">
        {children}
      </View>
    </View>
  );
}
