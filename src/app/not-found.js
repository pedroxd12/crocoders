import { Creepster } from 'next/font/google';
import styles from './not-found.module.css';

const creepster = Creepster({
  weight: '400',
  subsets: ['latin'],
});

export default function NotFound() {
    return (
        <div className={styles.container}>
            <div className={styles.batWrapper}>
                <div className={styles.bat}></div>
            </div>
            <h1 className={`${creepster.className} ${styles.title}`}>404</h1>
        </div>
    );
}
