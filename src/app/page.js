import styles from './animation.module.css';
import Footer from '@/components/Footer';
import Image from 'next/image';
import BongoCatKeyboard from '@/components/BongoCatKeyboard';
import AnimatedSection from '@/components/AnimatedSection';

export const metadata = {
  title: 'Crocoders - Club de Algoritmia',
  description: 'Club de algoritmia del ITLAC.',
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
      <main className={styles.container}>
        <section className={styles.hero}>
          <AnimatedSection className="w-full">
            <div className="flex flex-row items-center gap-6 md:gap-8 justify-center">
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
                className="w-50 h-50 md:w-100 md:h-100 object-contain flex-shrink-0"
              />
            </div>
          </AnimatedSection>
        </section>

        <section className={styles.listContainer}>
          <AnimatedSection className="contents">
            <p className={styles.listText}>Tu puedes</p>

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
                <h1 className={`${styles.noOffset} text-3xl md:text-6xl font-bold`}>Qué esperas,</h1>
                <h1 className={`${styles.noOffset} text-3xl md:text-6xl font-bold`}>inicia ahora.</h1>
                <p className={`${styles.heroDescription} text-base md:text-xl mt-4`}>Unete a nuestra comunidad y crece con nosotros.</p>
              </div>
              <div className="flex-1 w-full h-[350px] md:h-[600px]">
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
