import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, StatusBar
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import client from '../api/client';

const ACCENT = '#007ACC';
const BG = '#0e1117';
const SURFACE = '#161b22';
const BORDER = '#30363d';
const TEXT = '#e6edf3';
const MUTED = '#8b949e';
const DANGER = '#f85149';

export default function HistoryScreen() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSessions = async () => {
    try {
      const response = await client.get('/sessions');
      setSessions(response.data);
    } catch (error) {
      console.log('Failed to fetch sessions:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchSessions();
    }, [])
  );

  const getScoreColor = (score) => {
    if (score === null) return MUTED;
    if (score >= 80) return '#3fb950';
    if (score >= 50) return '#d29922';
    return DANGER;
  };

  const formatDate = (iso) => {
    const date = new Date(iso);
    return date.toLocaleDateString('lt-LT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatDuration = (start, end) => {
    if (!end) return 'In progress';
    const diff = Math.floor((new Date(end) - new Date(start)) / 1000);
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs}s`;
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

      <Text style={styles.title}>Drive History</Text>

      {sessions.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🚗</Text>
          <Text style={styles.emptyTitle}>No drives yet</Text>
          <Text style={styles.emptySubtitle}>Hit the road to see your history here.</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchSessions(); }}
              tintColor={ACCENT}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              {/* Left: score bar accent */}
              <View style={[styles.cardAccent, { backgroundColor: getScoreColor(item.score) }]} />

              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text style={styles.date}>{formatDate(item.startedAt)}</Text>
                  <Text style={[styles.score, { color: getScoreColor(item.score) }]}>
                    {item.score !== null ? item.score : '—'}
                  </Text>
                </View>

                <View style={styles.cardBottom}>
                  <Text style={styles.duration}>
                    {formatDuration(item.startedAt, item.endedAt)}
                  </Text>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: item.status === 'active' ? '#d29922' + '22' : '#3fb950' + '22' }
                  ]}>
                    <Text style={[
                      styles.statusText,
                      { color: item.status === 'active' ? '#d29922' : '#3fb950' }
                    ]}>
                      {item.status === 'active' ? 'IN PROGRESS' : 'COMPLETED'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BG,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: SURFACE,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  cardAccent: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: 16,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  date: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT,
    flex: 1,
    marginRight: 12,
  },
  score: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 34,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  duration: {
    fontSize: 13,
    color: MUTED,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});