import { useState, useEffect } from 'react';
import { client } from '../api/client';
import styles from './History.module.css';

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatDuration(startedAt, endedAt) {
  if (!endedAt) return '—';
  const a = new Date(startedAt).getTime();
  const b = new Date(endedAt).getTime();
  const min = Math.round((b - a) / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function scoreColor(score) {
  if (score == null) return 'var(--muted)';
  if (score >= 80) return 'var(--success)';
  if (score >= 50) return 'var(--amber)';
  return 'var(--danger)';
}

export default function History() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client
      .get('/sessions')
      .then(({ data }) => setSessions(data))
      .catch(() => setError('Could not load history.'))
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
        <h1 className={styles.title}>Drive history</h1>
        <p className={styles.subtitle}>Your past sessions, newest first.</p>
        {sessions.length === 0 ? (
          <p className={styles.empty}>No drives yet. Use the keliq app to record a drive.</p>
        ) : (
          <ul className={styles.list}>
            {sessions.map((s) => (
              <li key={s.id} className={styles.card}>
                <span
                  className={styles.scoreBar}
                  style={{ backgroundColor: scoreColor(s.score) }}
                />
                <div className={styles.cardBody}>
                  <div className={styles.cardRow}>
                    <span className={styles.date}>{formatDate(s.startedAt)}</span>
                    <span className={styles.duration}>{formatDuration(s.startedAt, s.endedAt)}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.status}>{s.status}</span>
                    {s.score != null && (
                      <span className={styles.score} style={{ color: scoreColor(s.score) }}>
                        Score: {s.score}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
