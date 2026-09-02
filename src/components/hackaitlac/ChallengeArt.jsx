/**
 * Ilustraciones de los desafíos.
 *
 * Las fotos de stock que había antes (almacén, bolsa de tela, rascacielos) no
 * describían el reto y una de ellas ni siquiera se había descargado — el
 * archivo era un HTML de 404. Estas piezas son vectoriales, comparten el
 * lenguaje de circuito del isotipo y heredan el color de la tarjeta con
 * `currentColor`, así que no hay imágenes rotas ni mezcla de estilos.
 */

const GOLD = '#F6C401';

function Art({ children, label }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
    >
      <g
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      >
        {children}
      </g>
    </svg>
  );
}

/* 01 — Clasificación arancelaria: producto que se ramifica hasta una fracción */
function Arancelaria() {
  return (
    <Art label="Clasificación arancelaria">
      <rect x="26" y="30" width="44" height="34" rx="4" />
      <path d="M26 40h44" opacity="0.45" />
      <path d="M70 47h22v-24h30M70 47h22v24h30M70 47h22v48h30" opacity="0.6" />
      <rect x="126" y="14" width="48" height="18" rx="9" />
      <rect x="126" y="62" width="48" height="18" rx="9" />
      <rect x="126" y="86" width="48" height="18" rx="9" />
      <circle cx="150" cy="23" r="4" fill={GOLD} stroke="none" />
      <path d="M30 128h140" opacity="0.35" />
      <path d="M46 128v22M78 128v34M110 128v14M142 128v28" opacity="0.5" />
      <circle cx="46" cy="156" r="6" fill={GOLD} stroke="none" />
      <circle cx="78" cy="168" r="5" stroke="currentColor" />
      <circle cx="110" cy="148" r="5" stroke="currentColor" />
      <circle cx="142" cy="162" r="6" fill={GOLD} stroke="none" />
    </Art>
  );
}

/* 02 — Alerta ciudadana: pulso de radar sobre un punto reportado */
function Alerta() {
  return (
    <Art label="Alerta ciudadana">
      <path d="M100 118c0-22 14-30 14-46a14 14 0 0 0-28 0c0 16 14 24 14 46Z" />
      <circle cx="100" cy="70" r="7" fill={GOLD} stroke="none" />
      <path d="M62 132a44 44 0 0 1 76 0" opacity="0.55" />
      <path d="M40 148a70 70 0 0 1 120 0" opacity="0.35" />
      <path d="M18 164a96 96 0 0 1 164 0" opacity="0.2" />
      <path d="M30 44h20M30 44v20" opacity="0.5" />
      <path d="M170 44h-20M170 44v20" opacity="0.5" />
      <circle cx="44" cy="96" r="4" fill={GOLD} stroke="none" />
      <circle cx="156" cy="96" r="4" fill={GOLD} stroke="none" />
    </Art>
  );
}

/* 03 — Resguardo industrial: inventario en anaqueles bajo control */
function Resguardo() {
  return (
    <Art label="Resguardo de equipo industrial">
      <rect x="26" y="34" width="148" height="112" rx="6" />
      <path d="M26 71h148M26 108h148" opacity="0.45" />
      <path d="M78 34v112M126 34v112" opacity="0.3" />
      <rect x="36" y="44" width="30" height="18" rx="3" fill={GOLD} stroke="none" opacity="0.9" />
      <rect x="88" y="81" width="28" height="18" rx="3" fill={GOLD} stroke="none" opacity="0.9" />
      <rect x="136" y="118" width="28" height="18" rx="3" stroke="currentColor" />
      <rect x="88" y="118" width="28" height="18" rx="3" stroke="currentColor" opacity="0.6" />
      <path d="M26 160h22M26 160v-8M174 160h-22M174 160v-8" opacity="0.6" />
      <circle cx="100" cy="170" r="5" fill={GOLD} stroke="none" />
    </Art>
  );
}

/* 04 — Despacho de agua: válvula, medición y flujo */
function Agua() {
  return (
    <Art label="Despacho automático de agua" >
      <path d="M100 22c22 30 34 46 34 62a34 34 0 0 1-68 0c0-16 12-32 34-62Z" />
      <circle cx="100" cy="88" r="13" fill={GOLD} stroke="none" />
      <path d="M22 138c14-10 26-10 40 0s26 10 40 0 26-10 40 0 26 10 36 0" opacity="0.6" />
      <path d="M22 158c14-10 26-10 40 0s26 10 40 0 26-10 40 0 26 10 36 0" opacity="0.35" />
      <path d="M40 44h26M40 44v22" opacity="0.45" />
      <path d="M160 44h-26M160 44v22" opacity="0.45" />
      <circle cx="46" cy="100" r="4" fill={GOLD} stroke="none" />
      <circle cx="154" cy="100" r="4" fill={GOLD} stroke="none" />
    </Art>
  );
}

/* 05 — Imagen urbana: traza de ciudad y volúmenes */
function Urbana() {
  return (
    <Art label="Imagen urbana">
      <path d="M20 158h160" />
      <rect x="30" y="98" width="34" height="60" rx="3" />
      <rect x="72" y="62" width="30" height="96" rx="3" />
      <rect x="110" y="86" width="26" height="72" rx="3" />
      <rect x="144" y="110" width="30" height="48" rx="3" />
      <path d="M38 112h18M38 126h18M38 140h18" opacity="0.4" />
      <path d="M80 76h14M80 92h14M80 108h14M80 124h14" opacity="0.4" />
      <path d="M118 100h10M118 116h10M118 132h10" opacity="0.4" />
      <circle cx="87" cy="46" r="6" fill={GOLD} stroke="none" />
      <path d="M87 52v10" opacity="0.5" />
      <circle cx="159" cy="96" r="5" fill={GOLD} stroke="none" />
      <path d="M159 102v8" opacity="0.5" />
      <path d="M20 176h48M84 176h32M132 176h48" opacity="0.3" />
    </Art>
  );
}

const ART = {
  arancelaria: Arancelaria,
  'alerta-ciudadana': Alerta,
  'resguardo-industrial': Resguardo,
  'despacho-agua': Agua,
  'imagen-urbana': Urbana,
};

export default function ChallengeArt({ id }) {
  const Component = ART[id];
  return Component ? <Component /> : null;
}
