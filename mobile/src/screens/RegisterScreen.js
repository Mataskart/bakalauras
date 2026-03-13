import { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  StatusBar, KeyboardAvoidingView, Platform, ScrollView, View
} from 'react-native';
import client from '../api/client';
import { saveToken } from '../storage/token';

const ACCENT = '#007ACC';
const BG = '#0e1117';
const SURFACE = '#161b22';
const BORDER = '#30363d';
const TEXT = '#e6edf3';
const MUTED = '#8b949e';

export default function RegisterScreen({ onLogin, onGoToLogin }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [firstNameFocused, setFirstNameFocused] = useState(false);
  const [lastNameFocused, setLastNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      // Register the account
      await client.post('/auth/register', { firstName, lastName, email, password });

      // Auto-login after successful registration
      const response = await client.post('/auth/login', { email, password });
      await saveToken(response.data.token);
      onLogin(response.data.token);
    } catch (error) {
      const message = error.response?.data?.error || 'Registration failed';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={BG} />
        <ScrollView
        style={{ backgroundColor: BG }}
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        >
        {/* Logo area */}
        <View style={styles.logoArea}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>K</Text>
          </View>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Join keliq and start scoring</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>FIRST NAME</Text>
              <TextInput
                style={[styles.input, firstNameFocused && styles.inputFocused]}
                placeholder="Name"
                placeholderTextColor={MUTED}
                value={firstName}
                onChangeText={setFirstName}
                onFocus={() => setFirstNameFocused(true)}
                onBlur={() => setFirstNameFocused(false)}
                autoCorrect={false}
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>LAST NAME</Text>
              <TextInput
                style={[styles.input, lastNameFocused && styles.inputFocused]}
                placeholder="Surname"
                placeholderTextColor={MUTED}
                value={lastName}
                onChangeText={setLastName}
                onFocus={() => setLastNameFocused(true)}
                onBlur={() => setLastNameFocused(false)}
                autoCorrect={false}
              />
            </View>
          </View>

          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={[styles.input, emailFocused && styles.inputFocused]}
            placeholder="email@example.com"
            placeholderTextColor={MUTED}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={[styles.input, passwordFocused && styles.inputFocused]}
            placeholder="•••••••••••••"
            placeholderTextColor={MUTED}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={TEXT} />
              : <Text style={styles.buttonText}>CREATE ACCOUNT</Text>
            }
          </TouchableOpacity>

          {/* Link back to login */}
          <TouchableOpacity style={styles.loginLink} onPress={onGoToLogin}>
            <Text style={styles.loginLinkText}>
              Already have an account?{' '}
              <Text style={styles.loginLinkAccent}>Log in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 40,
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
    fontSize: 30,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
    letterSpacing: 0.5,
  },
  form: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  halfField: {
    flex: 1,
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
  loginLink: {
    alignItems: 'center',
    marginTop: 24,
  },
  loginLinkText: {
    fontSize: 14,
    color: MUTED,
  },
  loginLinkAccent: {
    color: ACCENT,
    fontWeight: '700',
  },
});