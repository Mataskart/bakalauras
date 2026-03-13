import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, StatusBar, Alert, ScrollView,
  RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import client from '../api/client';
import { removeToken } from '../storage/token';

const ACCENT = '#007ACC';
const BG = '#0e1117';
const SURFACE = '#161b22';
const BORDER = '#30363d';
const TEXT = '#e6edf3';
const MUTED = '#8b949e';
const DANGER = '#f85149';

export default function ProfileScreen({ onLogout }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = async () => {
    try {
      const response = await client.get('/me');
      setProfile(response.data);
    } catch (error) {
      console.log('Failed to fetch profile:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchProfile();
    }, [])
  );

  const handleLogout = () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            await removeToken();
            onLogout();
          },
        },
      ]
    );
  };

  const getScoreColor = (score) => {
    if (!score) return MUTED;
    if (score >= 80) return '#3fb950';
    if (score >= 50) return '#d29922';
    return DANGER;
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('lt-LT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <StatusBar barStyle="light-content" backgroundColor={BG} />
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <ScrollView
        style={{ backgroundColor: BG }}
        contentContainerStyle={styles.inner}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchProfile(); }}
            tintColor={ACCENT}
          />
        }
      >
        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {profile?.firstName?.[0]}{profile?.lastName?.[0]}
            </Text>
          </View>
          <Text style={styles.name}>
            {profile?.firstName} {profile?.lastName}
          </Text>
          <Text style={styles.email}>{profile?.email}</Text>
          <Text style={styles.memberSince}>
            Member since {formatDate(profile?.createdAt)}
          </Text>
        </View>

        {/* Stats */}
        <Text style={styles.sectionLabel}>DRIVING STATS</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile?.totalSessions ?? 0}</Text>
            <Text style={styles.statLabel}>Total Drives</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: getScoreColor(profile?.averageScore) }]}>
              {profile?.averageScore ?? '—'}
            </Text>
            <Text style={styles.statLabel}>Avg Score</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: getScoreColor(profile?.bestScore) }]}>
              {profile?.bestScore ?? '—'}
            </Text>
            <Text style={styles.statLabel}>Best Score</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Text style={styles.logoutText}>LOG OUT</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BG,
  },
  inner: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: MUTED,
    marginBottom: 6,
  },
  memberSince: {
    fontSize: 12,
    color: MUTED,
    letterSpacing: 0.5,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 2,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 36,
  },
  statCard: {
    flex: 1,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -1,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: MUTED,
    fontWeight: '600',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: DANGER,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  logoutText: {
    color: DANGER,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
});