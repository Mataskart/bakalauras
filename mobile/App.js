import { useState, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { getToken } from './src/storage/token';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';

export default function App() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in on app start
    getToken().then((t) => {
      setToken(t);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return token
    ? <HomeScreen onLogout={() => setToken(null)} />
    : <LoginScreen onLogin={(t) => setToken(t)} />;
}