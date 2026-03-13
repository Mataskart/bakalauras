import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, StatusBar
} from 'react-native';
import client from '../api/client';
import { saveToken } from '../storage/token';

// Accent color inspired by VS Code blue
const ACCENT = '#007ACC';
const BG = '#0e1117';
const SURFACE = '#161b22';
const BORDER = '#30363d';
const TEXT = '#e6edf3';
const MUTED = '#8b949e';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const response = await client.post('/auth/login', { email, password });
      await saveToken(response.data.token);
      onLogin(response.data.token);
    } catch (error) {
      Alert.alert('Login failed', 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* Logo area */}
      <View style={styles.logoArea}>
        <View style={styles.logoMark}>
          <Text style={styles.logoMarkText}>K</Text>
        </View>
        <Text style={styles.title}>keliq</Text>
        <Text style={styles.subtitle}>Drive smart. Score high.</Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
        <Text style={styles.label}>EMAIL</Text>
        <TextInput
          style={[styles.input, emailFocused && styles.inputFocused]}
          placeholder="you@example.com"
          placeholderTextColor={MUTED}
          value={email}
          onChangeText={setEmail}
          onFocus={() => setEmailFocused(true)}
          onBlur={() => setEmailFocused(false)}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>PASSWORD</Text>
        <TextInput
          style={[styles.input, passwordFocused && styles.inputFocused]}
          placeholder="••••••••"
          placeholderTextColor={MUTED}
          value={password}
          onChangeText={setPassword}
          onFocus={() => setPasswordFocused(true)}
          onBlur={() => setPasswordFocused(false)}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={TEXT} />
            : <Text style={styles.buttonText}>LOG IN</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 28,
    justifyContent: 'center',
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 52,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoMarkText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -1,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  form: {
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: TEXT,
    marginBottom: 4,
  },
  inputFocused: {
    borderColor: ACCENT,
  },
  button: {
    backgroundColor: ACCENT,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
});