// ESLint esiste qui per UN motivo: i file `.astro` non li guardava nessuno.
// SonarCloud analizza css/js/ts/py/sql ma non ha un parser per Astro — 20 file e
// ~2800 righe (più di tutto ciò che Sonar vede) passavano senza analisi statica,
// e lì dentro sta la logica lato browser: form di contatto, palette, terminale.
//
// Non è un formattatore: niente regole di stile (niente Prettier — le liti sullo
// stile si fanno in due, e qui il codice ha un autore solo). Solo regole che
// trovano problemi.
//
// L'engine NON è coperto: è a zero dipendenze per decisione di ADR-0004, e non si
// rompe quella scelta per un linter. Lì il gate è Sonar + 93 test.
import js from '@eslint/js';
import ts from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default [
  // `.wrangler/` sono gli scratch del dev server (bundle Wrangler + SDK Sentry
  // riscritto): gitignored, la CI non li vede mai, ma in locale dopo un
  // `npx wrangler dev` il lint sputava 177 errori non nostri. Rumore che
  // nasconde il primo errore vero.
  { ignores: ['dist/**', '.astro/**', 'coverage/**', 'node_modules/**', '.wrangler/**'] },

  js.configs.recommended,
  ...ts.configs.recommended,
  ...astro.configs.recommended,

  // Script inline dei componenti: girano nel browser.
  {
    files: ['**/*.astro', '**/*.astro/*.ts'],
    languageOptions: { globals: globals.browser },
  },

  // Worker e test: runtime non-browser.
  {
    files: ['worker/**/*.js', 'test/**/*.mjs', '*.config.mjs', '*.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // Un argomento non usato è spesso solo la firma di una callback (`(_url, opt)`):
  // il prefisso `_` è la convenzione per dire "lo so, mi serve la posizione".
  //
  // `allowEmptyCatch`: un catch vuoto qui è deliberato, non dimenticato. localStorage
  // e sessionStorage LANCIANO in navigazione privata o con lo storage disabilitato:
  // ingoiare l'errore e proseguire col default è il comportamento giusto, non un
  // fallimento nascosto. Dove il silenzio sarebbe un bug (Worker, engine) non ci sono
  // catch vuoti — e lì il gate è Sonar.
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
