import { StyleSheet, Text, View } from 'react-native';

export function HomeRoute() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Monorepo ERP</Text>
      <Text style={styles.description}>Expo Web, iOS, Android 공용 화면</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  description: {
    fontSize: 16,
    marginTop: 8,
  },
});
