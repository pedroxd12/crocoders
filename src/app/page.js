import styles from './animation.module.css';
import Image from 'next/image';
import BongoCatKeyboard from '@/components/BongoCatKeyboard';
import AnimatedSection from '@/components/AnimatedSection';
import Footer from '@/components/Footer';
import HomeBodyScrollLock from './HomeBodyScrollLock';

export const metadata = {
  title: 'Inicio',
  description:
    'Crocoders, el club de algoritmia y programación competitiva del ITLAC. Conferencias, talleres, concursos y comunidad.',
  alternates: { canonical: '/' },
};

export default function Home() {
  const items = [
    'resolver.',
    'divertirte.',
    'innovar.',
    'crecer.',
    'practicar.',
    'aprender.',
    'enseñar.',
    'compartir.',
    'crear.',
    'colaborar.',
    'imaginar.',
    'programar.',
  ];

  return (
    <div className={styles.pageWrapper}>
      <HomeBodyScrollLock />
      <main className={styles.container}>
        <section className={styles.hero}>
          <AnimatedSection className="w-full">
            <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 justify-center text-center md:text-left">
              <div className="flex-1">
                <h1 className={`${styles.noOffset} ${styles.heroText} text-green-500`}>
                  Crocoders
                </h1>
                <p className={styles.heroDescription}>
                  Club de algoritmia.
                </p>
              </div>
              <Image
                src="/img/logo.png"
                alt="Crocoders Logo"
                width={300}
                height={300}
                priority
                sizes="(max-width: 767.98px) 160px, (max-width: 1176px) 34vw, 400px"
                className={styles.heroLogo}
              />
            </div>
          </AnimatedSection>
        </section>

        <section className={styles.listContainer}>
          <AnimatedSection className="contents">
            <p className={styles.listText}>Tú puedes</p>

            <ul className={styles.list}>
              {items.map((item, index) => (
                <li key={index} style={{ '--i': index }}>
                  {item}
                </li>
              ))}
            </ul>
          </AnimatedSection>
        </section>

        <section className={styles.hero}>
          <AnimatedSection className="w-full">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8">
              <div className="flex-1 text-center md:text-left w-full">
                <h2 className={`${styles.noOffset} text-3xl md:text-6xl font-bold`}>Qué esperas,</h2>
                <h2 className={`${styles.noOffset} text-3xl md:text-6xl font-bold`}>inicia ahora.</h2>
                <p className={`${styles.heroDescription} text-base md:text-xl mt-4`}>Únete a nuestra comunidad y crece con nosotros.</p>
              </div>
              <div className="flex-1 w-full flex justify-center">
                <BongoCatKeyboard />
              </div>
            </div>
          </AnimatedSection>
        </section>
      </main>
      <Footer />
    </div>
  );
}
