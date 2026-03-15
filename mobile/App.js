import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { getToken } from './src/storage/token';
import { setUnauthorizedHandler } from './src/api/client';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState('login');

  useEffect(() => {
    getToken().then((t) => {
      setToken(t);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setToken(null));
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0e1117' }}>
        <ActivityIndicator size="large" color="#007ACC" />
      </View>
    );
  }

  if (!token) {
    return screen === 'login'
      ? <LoginScreen
          onLogin={(t) => setToken(t)}
          onGoToRegister={() => setScreen('register')}
        />
      : <RegisterScreen
          onLogin={(t) => setToken(t)}
          onGoToLogin={() => setScreen('login')}
        />;
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: '#007ACC',
          tabBarInactiveTintColor: '#8b949e',
          tabBarStyle: {
            backgroundColor: '#161b22',
            borderTopColor: '#30363d',
          },
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;
            if (route.name === 'Drive') {
              iconName = focused ? 'car' : 'car-outline';
            } else if (route.name === 'History') {
              iconName = focused ? 'time' : 'time-outline';
            } else if (route.name === 'Leaderboard') {
              iconName = focused ? 'trophy' : 'trophy-outline';
            } else if (route.name === 'Profile') {
              iconName = focused ? 'person' : 'person-outline';
            }
            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Drive" options={{ tabBarLabel: 'Drive' }}>
          {() => <HomeScreen />}
        </Tab.Screen>
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{ tabBarLabel: 'History' }}
        />
        <Tab.Screen
          name="Leaderboard"
          component={LeaderboardScreen}
          options={{ tabBarLabel: 'Leaderboard' }}
        />
        <Tab.Screen name="Profile" options={{ tabBarLabel: 'Profile' }}>
          {() => <ProfileScreen onLogout={() => setToken(null)} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}