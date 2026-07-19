import { Text, View, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <View style={styles.orb} />
      <Text style={styles.title}>Anzaro</Text>
      <Text style={styles.sub}>الكرة الذكية</Text>
      <Text style={styles.version}>v2.6.0 · If you see this, the app works!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#7c3aed',
    marginBottom: 20,
  },
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  sub: {
    color: '#9ca3af',
    fontSize: 16,
    marginTop: 8,
  },
  version: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 24,
  },
});
