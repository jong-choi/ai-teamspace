import { StyleSheet, View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';

export function HomeRoute() {
  return (
    <View style={styles.container}>
      <Text variant="h1">Monorepo ERP</Text>
      <Text>Expo Web, iOS, Android 공용 화면</Text>
      <Button>
        <Text>React Native Reusables</Text>
      </Button>
    </View>
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
