import { defineConfig } from 'astro/config';

// Config minimale: nessun adapter framework aggiuntivo, output statico puro.
// Se in futuro serviranno funzioni server-side (es. proxy verso FastAPI),
// si aggiunge qui l'adapter Vercel: https://docs.astro.build/en/guides/integrations-guide/vercel/
export default defineConfig({
  site: 'https://marcobellingeri.dev', // sostituisci col dominio reale quando lo hai
  output: 'static',
});
