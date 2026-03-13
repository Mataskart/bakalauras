import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import client from '../api/client';

export default function LeaderboardScreen() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeaderboard = async () => {
    try {
      const response = await client.get('/leaderboard');
      setLeaderboard(response.data);
    } catch (error) {
      console.log('Failed to fetch leaderboard:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchLeaderboard();
    }, [])
  );

  const getRankEmoji = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#2ecc71';
    if (score >= 50) return '#f39c12';
    return '#e74c3c';
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
      <Text style={styles.title}>Leaderboard</Text>
      {leaderboard.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>No drivers ranked yet.</Text>
        </View>
      ) : (
        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.rank.toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => {
              setRefreshing(true);
              fetchLeaderboard();
            }} />
          }
          renderItem={({ item }) => (
            <View style={[
              styles.card,
              item.rank === 1 && styles.cardFirst
            ]}>
              <Text style={styles.rank}>{getRankEmoji(item.rank)}</Text>
              <View style={styles.cardMiddle}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sessions}>{item.totalSessions} drives</Text>
              </View>
              <Text style={[styles.score, { color: getScoreColor(item.averageScore) }]}>
                {item.averageScore}
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
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
  },
  cardFirst: {
    backgroundColor: '#fffbea',
    borderWidth: 1,
    borderColor: '#f39c12',
  },
  rank: {
    fontSize: 24,
    width: 48,
    textAlign: 'center',
  },
  cardMiddle: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  sessions: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  score: {
    fontSize: 28,
    fontWeight: 'bold',
  },
});