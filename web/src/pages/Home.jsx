import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Home.module.css';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className={styles.hero}>
      <div className={styles.container}>
        <h1 className={styles.title}>keliq</h1>
        <p className={styles.tagline}>Safe driving, simple.</p>
        <p className={styles.intro}>
          keliq is a driving safety monitor that uses your phone - no extra hardware.
          Drive as usual; the app tracks smooth braking, acceleration, and turns, and compares
          your speed to local limits, with an option to do so in the background. Get a live score, see your history, and see how you
          rank on the leaderboard.
        </p>
        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>📱</span>
            <h3>Requires only a phone</h3>
            <p>Uses the sensors and GPS you already have. No dongles or dash cams.</p>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>📊</span>
            <h3>Live score</h3>
            <p>0-100 score based on smooth driving and speed compliance. See it update every few seconds.</p>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🗺️</span>
            <h3>Speed limits</h3>
            <p>OpenStreetMap data shows the limit for your road. Find out if you're able to stay within it for a better safety score.</p>
          </div>
        </div>
        <div className={styles.cta}>
          {user ? (
            <div className={styles.ctaLinks}>
              <Link to="/history" className={styles.btnPrimary}>View history</Link>
              <Link to="/leaderboard" className={styles.btnGhost}>Leaderboard</Link>
            </div>
          ) : (
            <div className={styles.ctaLinks}>
              <Link to="/register" className={styles.btnPrimary}>Get started</Link>
              <Link to="/login" className={styles.btnGhost}>Log in</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
