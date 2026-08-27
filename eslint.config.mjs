// eslint-config-next >= 15 ya publica flat config nativa (`Linter.Config[]`),
// asi que se importa directo. Pasarla por `FlatCompat` la trataba como config
// legacy de eslintrc y el validador reventaba con "Converting circular
// structure to JSON" al intentar serializar los plugins para el mensaje de
// error, sin llegar nunca a lintear un archivo.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
