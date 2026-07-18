/// <reference types="astro/client" />

// I contratti globali del browser, in un posto solo.
//
// Prima erano sparsi e duplicati: `openNeonTerminal` era dichiarato IDENTICO dentro
// lo <script> di CommandPalette.astro e dentro quello di NeonTerminal.astro, e i
// callback di Turnstile non erano dichiarati affatto — vivevano come `as any`.
//
// Sono contratti *fra* componenti, e con uno script di terzi. Un contratto ha un
// posto solo: se cambia la firma, deve rompersi in un punto, non in tre — o in
// nessuno, che è quello che succedeva con gli `as any`.

interface Window {
  // NeonTerminal espone l'apertura del terminale CRT; CommandPalette la invoca.
  // Il collegamento fra i due componenti passa per `window` e per nient'altro.
  openNeonTerminal?: () => void;

  // Il widget Turnstile è di Cloudflare: gira nel suo script e ci parla solo
  // attraverso `window`, chiamando i nostri callback PER NOME (dichiarati nel
  // markup di Servizi.astro come data-callback / data-error-callback). Senza queste
  // righe il contratto esisterebbe solo dentro due attributi HTML.
  turnstile?: {
    execute?: (el?: HTMLElement) => void;
    reset?: (el?: HTMLElement) => void;
  };
  svcTurnstileOk?: (token: string) => void;
  svcTurnstileErr?: () => void;

  // Secondo widget Turnstile, dedicato al comando `ask` del terminale: stesso
  // script globale di Cloudflare, container e callback distinti da quelli del
  // form (Turnstile supporta più istanze in pagina via render espliciti).
  askTurnstileOk?: (token: string) => void;
  askTurnstileErr?: () => void;
}

interface Navigator {
  // `userAgentData` è recente e la libreria DOM di TypeScript non la conosce
  // ancora: è il motivo per cui CommandPalette tiene un fallback su `platform`.
  userAgentData?: { platform?: string };
}
