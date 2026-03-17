import styles from './Contacts.module.css';

export default function Contacts() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Contacts</h1>
        <p className={styles.intro}>
          Get in touch about keliq — feedback, support, or partnership.
        </p>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Project & support</h2>
          <p className={styles.cardText}>
            keliq is an open project. For questions, bug reports, or feature ideas, use the
            repository or reach out via the channels below.
          </p>
          <ul className={styles.list}>
            <li>
              <strong>GitHub</strong>{' '}
              <a href="https://github.com/Mataskart/bakalauras" target="_blank" rel="noreferrer">
                github.com/Mataskart/bakalauras
              </a>
            </li>
            <li>
              <strong>Backend API</strong>{' '}
              <a href="https://keliq.lt" target="_blank" rel="noreferrer">
                keliq.lt
              </a>
            </li>
          </ul>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Author</h2>
          <p className={styles.cardText}>
            Developed as a bachelor’s thesis project. For academic or collaboration inquiries,
            please refer to the repository or documentation.
          </p>
        </div>
      </div>
    </div>
  );
}
