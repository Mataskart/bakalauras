import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import client from '../api/client';

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

  // Reload every time the tab is focused
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchSessions();
    }, [])
  );

  const getScoreColor = (score) => {
    if (score === null) return '#999';
    if (score >= 80) return '#2ecc71';
    if (score >= 50) return '#f39c12';
    return '#e74c3c';
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
        <ActivityIndicator size="large" color="#1a1a2e" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Drive History</Text>
      {sessions.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>No drives yet — go for a drive!</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => {
              setRefreshing(true);
              fetchSessions();
            }} />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <Text style={styles.date}>{formatDate(item.startedAt)}</Text>
                <Text style={styles.duration}>
                  {formatDuration(item.startedAt, item.endedAt)}
                </Text>
                <Text style={[
                  styles.status,
                  { color: item.status === 'active' ? '#f39c12' : '#2ecc71' }
                ]}>
                  {item.status === 'active' ? 'In progress' : 'Completed'}
                </Text>
              </View>
              <Text style={[styles.score, { color: getScoreColor(item.score) }]}>
                {item.score !== null ? item.score : '—'}
              </Text>
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
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 24,
  },
  empty: {
    color: '#999',
    fontSize: 16,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
  },
  cardLeft: {
    flex: 1,
  },
  date: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    marginBottom: 4,
  },
  duration: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
  },
  score: {
    fontSize: 36,
    fontWeight: 'bold',
  },
});