import { StyleSheet, View } from 'react-native';

import { DashboardShell } from '@core/app/shell/dashboard-shell';
import { Text } from '@repo/client/rnr/components/ui/text';

export function HomeRoute() {
  return (
    <DashboardShell>
      <View style={styles.container}>
        <Text variant="h1">Monorepo ERP</Text>
        <Text>Expo Web, iOS, Android 공용 화면</Text>
        <View className="rounded-md bg-secondary px-4 py-2">
          <Text>React Native Reusables</Text>
        </View>
      </View>
    </DashboardShell>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    padding: 24,
  },
});
