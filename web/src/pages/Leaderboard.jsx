import { useState, useEffect } from 'react';
import { client } from '../api/client';
import styles from './Leaderboard.module.css';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client
      .get('/leaderboard')
      .then(({ data }) => setEntries(data))
      .catch(() => setError('Could not load leaderboard.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p className={styles.muted}>Loading…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p className={styles.error}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Leaderboard</h1>
        <p className={styles.subtitle}>Top 10 by average driving score.</p>
        {entries.length === 0 ? (
          <p className={styles.empty}>No completed drives yet. Be the first!</p>
        ) : (
          <ul className={styles.list}>
            {entries.map((e, i) => (
              <li
                key={e.rank}
                className={styles.card}
                data-first={i === 0 ? true : undefined}
              >
                <span className={styles.rank}>
                  {MEDALS[i] ?? `#${e.rank}`}
                </span>
                <div className={styles.info}>
                  <span className={styles.name}>{e.name}</span>
                  <span className={styles.meta}>
                    {e.totalSessions} drive{e.totalSessions !== 1 ? 's' : ''} · avg {e.averageScore}
                  </span>
                </div>
                <span className={styles.score}>{e.averageScore}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
