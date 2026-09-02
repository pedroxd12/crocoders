import { League_Spartan, Space_Grotesk } from 'next/font/google';

/**
 * Tipografías del manual de marca (PRESENTACION LOGO.pdf):
 *   · League Spartan  — display / titulares (se usa tal cual)
 *   · Telegraf        — texto corrido
 *
 * Telegraf es una fuente de pago de Pangram Pangram y no puede servirse desde
 * Google Fonts. Space Grotesk es la grotesca libre más cercana en proporción y
 * carácter, así que ocupa su lugar en el cuerpo de texto.
 */
const leagueSpartan = League_Spartan({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-league-spartan',
  display: 'swap',
});

const bodyFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-hack-body',
  display: 'swap',
});

export default function HackaitlacLayout({ children }) {
  return <div className={`${leagueSpartan.variable} ${bodyFont.variable}`}>{children}</div>;
}
