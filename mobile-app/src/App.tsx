import { Text, View } from 'react-native';

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0f0f1e', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#7c3aed', marginBottom: 20 }} />
      <Text style={{ color: '#ffffff', fontSize: 32, fontWeight: 'bold' }}>Anzaro</Text>
      <Text style={{ color: '#9ca3af', fontSize: 16, marginTop: 8 }}>الكرة الذكية</Text>
    </View>
  );
}
