import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Layout.module.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.container}>
          <Link to="/" className={styles.logo}>keliq</Link>
          <nav className={styles.nav}>
            <Link to="/">Home</Link>
            <Link to="/contacts">Contacts</Link>
            {user ? (
              <>
                <Link to="/history">History</Link>
                <Link to="/leaderboard">Leaderboard</Link>
                <span className={styles.user}>{user.firstName}</span>
                <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login">Log in</Link>
                <Link to="/register" className={styles.registerLink}>Sign up</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <div className={styles.container}>
          <span className={styles.footerText}>keliq — safe driving, simple</span>
        </div>
      </footer>
    </div>
  );
}
