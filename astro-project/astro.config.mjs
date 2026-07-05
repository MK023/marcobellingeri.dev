import { defineConfig } from 'astro/config';

// Config minimale: nessun adapter framework aggiuntivo, output statico puro.
// Se in futuro serviranno funzioni server-side (es. proxy verso FastAPI),
// si aggiunge qui l'adapter Vercel: https://docs.astro.build/en/guides/integrations-guide/vercel/
export default defineConfig({
  site: 'https://marcobellingeri.dev', // sostituisci col dominio reale quando lo hai
  output: 'static',
  // i18n IT/EN — EN primario (target anglosassone). Entrambe le lingue prefissate
  // (/en/ e /it/) → hreflang espliciti, nessun default ambiguo, SEO/AEO internazionali.
  // Il geo-redirect su `/` è demandato a un Worker Cloudflare al go-live (ADR-0001 §4).
  i18n: {
    locales: ['en', 'it'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: true,
    },
  },
});
