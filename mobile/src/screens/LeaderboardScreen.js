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
const GOLD = '#d29922';

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

  const getScoreColor = (score) => {
    if (score >= 80) return '#3fb950';
    if (score >= 50) return GOLD;
    return DANGER;
  };

  const getRankDisplay = (rank) => {
    if (rank === 1) return { emoji: '🥇', color: '#FFD700' };
    if (rank === 2) return { emoji: '🥈', color: '#C0C0C0' };
    if (rank === 3) return { emoji: '🥉', color: '#CD7F32' };
    return { emoji: `#${rank}`, color: MUTED };
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

      <Text style={styles.title}>Leaderboard</Text>
      <Text style={styles.subtitle}>TOP DRIVERS THIS SEASON</Text>

      {leaderboard.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🏆</Text>
          <Text style={styles.emptyTitle}>No rankings yet</Text>
          <Text style={styles.emptySubtitle}>Complete a drive to appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.rank.toString()}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchLeaderboard(); }}
              tintColor={ACCENT}
            />
          }
          renderItem={({ item }) => {
            const rankDisplay = getRankDisplay(item.rank);
            const isTopThree = item.rank <= 3;

            return (
              <View style={[
                styles.card,
                isTopThree && styles.cardHighlighted,
                item.rank === 1 && styles.cardFirst,
              ]}>
                {/* Rank */}
                <View style={styles.rankContainer}>
                  <Text style={styles.rankEmoji}>{rankDisplay.emoji}</Text>
                </View>

                {/* Name + drives */}
                <View style={styles.cardMiddle}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.drives}>{item.totalSessions} drives</Text>
                </View>

                {/* Score */}
                <View style={styles.scoreContainer}>
                  <Text style={[styles.score, { color: getScoreColor(item.averageScore) }]}>
                    {item.averageScore}
                  </Text>
                  <Text style={styles.scoreMax}>avg</Text>
                </View>
              </View>
            );
          }}
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 2,
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
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 12,
    marginBottom: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardHighlighted: {
    borderColor: GOLD + '55',
  },
  cardFirst: {
    borderColor: '#FFD700' + '88',
    backgroundColor: '#FFD700' + '0A',
  },
  rankContainer: {
    width: 44,
    alignItems: 'center',
  },
  rankEmoji: {
    fontSize: 22,
  },
  cardMiddle: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 3,
  },
  drives: {
    fontSize: 12,
    color: MUTED,
    letterSpacing: 0.5,
  },
  scoreContainer: {
    alignItems: 'flex-end',
  },
  score: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 30,
  },
  scoreMax: {
    fontSize: 11,
    color: MUTED,
    letterSpacing: 1,
    marginTop: 2,
  },
});