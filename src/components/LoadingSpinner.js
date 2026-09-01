'use client';

/**
 * Indicador de carga.
 *
 * La versión anterior sólo aceptaba `text` e ignoraba en silencio `size`,
 * `className`, `fullPage` y `fullScreen`, que le pasaban 15 llamadas. El
 * resultado visible: dentro de los botones de "Guardar" aparecía un círculo de
 * 48px con la palabra "Cargando..." debajo, deformando el botón.
 *
 * Para bloques de contenido prefiere `Skeleton`: conserva el layout y se
 * percibe más rápido. Este spinner es para acciones puntuales (botones).
 */
const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-4',
};

export default function LoadingSpinner({
  text = 'Cargando...',
  size = 'lg',
  showText,
  fullScreen = false,
  fullPage = false,
  className = '',
}) {
  // Dentro de un botón (size="sm") el texto sobra: lo acompaña la etiqueta.
  const withText = showText ?? size !== 'sm';

  const spinner = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`} role="status">
      <div className={`${SIZES[size] || SIZES.lg} animate-spin rounded-full border-brand border-t-transparent`} />
      {withText ? <p className="text-sm text-muted">{text}</p> : <span className="sr-only">{text}</span>}
    </div>
  );

  if (fullScreen || fullPage) {
    return <div className="flex min-h-[60vh] w-full items-center justify-center">{spinner}</div>;
  }
  return spinner;
}
