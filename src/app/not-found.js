import Link from 'next/link';
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

            {/* Esta pantalla también se usa para rutas inexistentes bajo /admin,
                donde AppShell oculta el Header y el panel no ha llegado a montar
                su barra lateral: sin estos enlaces la única salida era el botón
                atrás del navegador. */}
            <p className="mt-4 text-center text-muted">
                La página que buscas no existe o cambió de dirección.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                    href="/"
                    className="inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2.5 font-semibold text-bg transition-colors hover:bg-brand-strong"
                >
                    Volver al inicio
                </Link>
                <Link
                    href="/eventos"
                    className="inline-flex items-center justify-center rounded-lg border border-line-strong px-5 py-2.5 font-medium text-fg transition-colors hover:bg-surface"
                >
                    Ver eventos
                </Link>
            </div>
        </div>
    );
}
