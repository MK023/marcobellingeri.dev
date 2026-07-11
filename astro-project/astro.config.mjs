import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import sentry from '@sentry/astro';

// Config minimale: nessun adapter framework aggiuntivo, output statico puro.
// Se in futuro serviranno funzioni server-side (es. proxy verso FastAPI),
// si aggiunge qui l'adapter Vercel: https://docs.astro.build/en/guides/integrations-guide/vercel/
export default defineConfig({
  site: 'https://marcobellingeri.dev',
  output: 'static',
  // CSP: Astro calcola gli hash dei propri script/style bundled e li scrive in un
  // <meta http-equiv>. Lo script anti-FOUC del tema è `is:inline`, quindi Astro NON
  // lo tocca: il suo hash va tenuto a mano qui sotto. Se quello script cambia, il
  // test `npm run test:csp` fallisce e dice quale hash mettere.
  // `frame-ancestors` non sta qui: dentro un <meta> è ignorato per specifica, quindi
  // resta l'unica direttiva CSP dichiarata in public/_headers.
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "font-src 'self'",
        "img-src 'self' data:",
        // challenges.cloudflare.com: il widget Turnstile del form di contatto —
        // script + iframe + XHR verso Cloudflare. Unica concessione a un host esterno,
        // e di Cloudflare stessa; la CSP resta a hash, senza unsafe-inline.
        // L'ingest Sentry (region DE): dove client e Worker spediscono gli errori.
        "connect-src 'self' https://api.github.com https://challenges.cloudflare.com https://o4511713634484224.ingest.de.sentry.io",
        'frame-src https://www.cal.eu https://cal.eu https://challenges.cloudflare.com',
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://challenges.cloudflare.com'],
        hashes: ['sha256-9NdyE0/QP+rTIpE4DN6oRo2gQFa4pcIWT/PwHZBV09k='],
      },
      styleDirective: {
        resources: ["'self'"],
      },
    },
  },
  // i18n IT/EN — EN primario (target anglosassone). Entrambe le lingue prefissate
  // (/en/ e /it/) → hreflang espliciti, nessun default ambiguo, SEO/AEO internazionali.
  // Il geo-redirect su `/` lo fa worker/index.js (paese + cookie, ADR-0001 §4).
  i18n: {
    locales: ['en', 'it'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: true,
    },
  },
  vite: {
    build: {
      // Senza questo, il minificatore riscrive `@media (max-width:640px)` come
      // `@media (width<=640px)` — la sintassi a intervalli di Media Queries Level 4,
      // che Safari capisce solo dalla 16.4 (marzo 2023). Su un iPhone fermo a iOS 15
      // quelle media query vengono ignorate e il sito perde TUTTO il layout mobile,
      // in silenzio. Il target lo decide chi visita, non chi compila.
      cssTarget: ['safari14', 'chrome87', 'firefox78', 'edge88'],
      // Vite inlinizza gli asset sotto i 4 KB come data: URI. Diversi subset di
      // font (latin-ext, vietnamese, cyrillic) ci finiscono sotto, e `font-src
      // 'self'` li blocca: nove font non caricati e altrettanti errori in console.
      // Serviti come file restano dentro 'self' e si prendono il Cache-Control
      // immutable di /_astro/. `undefined` = lascia il default per tutto il resto.
      assetsInlineLimit: (filePath) =>
        /\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined,
    },
  },
  // Sitemap per-lingua: hreflang coerenti con quelli del BaseLayout (en/it).
  integrations: [
    sitemap({
      // Il root `/` è solo un redirect placeholder: escluderlo evita un secondo
      // hreflang="en" in conflitto. Canonici = /en/ e /it/.
      filter: (page) => page !== 'https://marcobellingeri.dev/',
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', it: 'it' },
      },
    }),
    // Sentry, SOLO error monitoring: la config del client sta in
    // sentry.client.config.js (tracing/replay/logs spenti — quota tutta sugli
    // errori). SDK bundlato nella build → servito da 'self', la CSP script-src
    // resta a hash; l'unica concessione è l'ingest in connect-src (region DE, UE).
    sentry({
      // L'upload delle source map si accende quando SENTRY_AUTH_TOKEN arriva
      // dalla CI (Doppler → GitHub secret). In locale resta spento e non stampa
      // warning a ogni build.
      sourceMapsUploadOptions: {
        enabled: Boolean(process.env.SENTRY_AUTH_TOKEN),
        org: 'bellingeri',
        project: 'marcobellingeri-dev',
        authToken: process.env.SENTRY_AUTH_TOKEN,
        // Le mappe serviranno solo a Sentry: mai deployate su Cloudflare.
        filesToDeleteAfterUpload: './dist/**/*.map',
      },
    }),
  ],
});
