// Dizionario stringhe UI (chrome del sito) — punto d'estensione condiviso per
// i18n. Qui vivono le stringhe di interfaccia: meta, a11y, loader, sommario,
// palette comandi, etichette di stato. Il body delle sezioni (dossier, percorso,
// stack, servizi, progetti…) è tradotto nei rispettivi componenti, che tengono
// il testo accanto al markup che lo rende.
// C4 (switcher lingua) si appoggia a `languages` e a getRelativeLocaleUrl.

export const languages = {
  en: 'English',
  it: 'Italiano',
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = 'en';

// Locale BCP-47 per toLocaleDateString / toLocaleTimeString lato client.
export const dateLocale: Record<Lang, string> = { en: 'en-GB', it: 'it-IT' };

export const ui = {
  en: {
    // "Cloud & Security Edition" è un token di brand: resta invariato tra le lingue.
    'site.title': 'Bellingeri — Cloud & Security Edition',
    'site.description':
      'Marco Bellingeri — freelance Cloud Platform & Security Engineer. Hands-on DevOps, Cloud and Security: pair programming, real case studies, automation. Casale Monferrato, Italy.',
    'og.locale': 'en_US',
    'a11y.skipToContent': 'Skip to content',
    'loader.label': 'FLIPPING THROUGH…',
    'sec.cmd': '$ security headers served by this page',
    'sec.source': 'SOURCE: HEAD SELF · LIVE',
    'sec.loading': 'reading response headers…',
    'sec.note': 'Headers are applied at the edge (Cloudflare) and read live from this page’s response — locally they may show as missing.',
    'sec.title': 'Security',
    'sec.intro': 'This page audits itself. The table below is not a claim — it is read live from the response headers your browser just received.',

    // ---- utility bar ----
    'ub.issue': 'VOL. 01 — NO. 07',
    'ub.place': 'CASALE MONFERRATO, IT',
    'ub.editionDay': '☀ DAY EDITION',
    'ub.editionNight': '☾ NIGHT EDITION',
    'ub.editionTitle': 'Switch between day and night edition',
    'ub.cv': '↓ CV',
    'ub.cvTitle': 'Download the CV as PDF',
    'ub.commands': 'COMMANDS',
    'ub.commandsTitle': ' — open/close commands',

    // ---- sommario / TOC ----
    'nav.dossier': 'DOSSIER',
    'nav.percorso': 'CAREER',
    'nav.stack': 'STACK',
    'nav.security': 'SECURITY',
    'nav.fieldNotes': 'FIELD NOTES',
    'nav.projects': 'PROJECTS',
    'nav.servizi': 'SERVICES',
    'nav.archive': 'ARCHIVE',
    'nav.booking': 'BOOKING',
    'nav.contact': 'CONTACT',
    'nav.hint': '← scroll to see all sections →',

    // ---- command palette ----
    'cmdk.placeholder': 'Type a command or a section…',
    'cmdk.navHint': '↑↓ NAVIGATE · ENTER OPEN',
    'cmdk.escHint': 'ESC CLOSE',
    'cmdk.empty': 'No command found.',
    'cmdk.goTo': 'Go to',
    'cmdk.openGithub': 'Open GitHub',
    'cmdk.copyEmail': 'Copy email address',
    'cmdk.printCv': 'Download CV (PDF)',
    'cmdk.openTerminal': 'Open secret terminal',

    // ---- progetti ----
    'proj.details': 'DETAILS ＋',
    'proj.close': 'CLOSE －',

    // ---- archivio ----
    'archive.loadingIndex': 'loading back issues…',
    'archive.loadingIssue': 'loading issue',
    'archive.openIssue': 'Open issue',
    'archive.source': 'Source',
    'archive.unavailable': 'archive temporarily unavailable',
    'og.imageAlt': 'Marco Bellingeri — Cloud Platform & Security Engineer',

    // ---- appuntamenti ----
    'booking.title': 'Booking',
    'booking.note':
      'Thirty minutes, free, no commitment. Time zone handled automatically, email confirmation — no back-and-forth to find a time. If we then work together, the first day is on me unless it convinces you.',
    'booking.facadeLabel': 'CAL.EU — LOADED ON REQUEST',
    'booking.facadeCopy':
      'The calendar is served by Cal.eu, a third party. Nothing is loaded — and nothing leaves your browser — until you click.',
    'booking.facadeCta': 'LOAD THE CALENDAR →',
    'booking.frameTitle': 'Booking calendar',
    'booking.frameLabel': 'CLASSIFIED — BOOKING OPEN',

    // ---- footer ----
    'foot.contacts': 'Contacts',
    'foot.online': 'Online',
    'foot.colophon': 'Colophon',
    'foot.copy': 'COPY',
    'foot.copied': 'COPIED ✓',
    'foot.copyError': 'ERROR',
    'foot.setIn': 'Set in Anton, Source Serif 4, JetBrains Mono.',
    'foot.printed': 'Printed digitally, wherever you are.',
    'foot.sealTitle': 'Built in pair programming with Claude Code',
    'foot.finePrint':
      '© Marco Bellingeri — Cloud & Security Edition. All rights reserved, no bugs in production (hopefully).',
  },
  it: {
    'site.title': 'Bellingeri — Cloud & Security Edition',
    'site.description':
      'Marco Bellingeri — Cloud Platform & Security Engineer freelance. DevOps, Cloud e Security con un approccio hands-on: pair programming, case study reali, automazione. Casale Monferrato, IT.',
    'og.locale': 'it_IT',
    'a11y.skipToContent': 'Salta al contenuto',
    'loader.label': 'SFOGLIANDO…',
    'sec.cmd': '$ header di sicurezza serviti da questa pagina',
    'sec.source': 'FONTE: HEAD SELF · LIVE',
    'sec.loading': 'lettura degli header di risposta…',
    'sec.note': 'Gli header sono applicati all’edge (Cloudflare) e letti live dalla risposta di questa pagina — in locale possono risultare assenti.',
    'sec.title': 'Security',
    'sec.intro': 'Questa pagina fa l’audit di sé stessa. La tabella qui sotto non è una dichiarazione: è letta dal vivo dagli header di risposta che il tuo browser ha appena ricevuto.',

    // ---- utility bar ----
    'ub.issue': 'VOL. 01 — NO. 07',
    'ub.place': 'CASALE MONFERRATO, IT',
    'ub.editionDay': '☀ EDIZIONE GIORNO',
    'ub.editionNight': '☾ EDIZIONE NOTTE',
    'ub.editionTitle': 'Passa da edizione giorno a notte',
    'ub.cv': '↓ CV',
    'ub.cvTitle': 'Scarica il CV in PDF',
    'ub.commands': 'COMANDI',
    'ub.commandsTitle': ' — apri/chiudi comandi',

    // ---- sommario / TOC ----
    'nav.dossier': 'DOSSIER',
    'nav.percorso': 'PERCORSO',
    'nav.stack': 'STACK',
    'nav.security': 'SECURITY',
    'nav.fieldNotes': 'FIELD NOTES',
    'nav.projects': 'PROGETTI',
    'nav.servizi': 'SERVIZI',
    'nav.archive': 'ARCHIVIO',
    'nav.booking': 'APPUNTAMENTI',
    'nav.contact': 'CONTATTI',
    'nav.hint': '← scorri per vedere tutte le sezioni →',

    // ---- command palette ----
    'cmdk.placeholder': 'Digita un comando o una sezione…',
    'cmdk.navHint': '↑↓ NAVIGA · ENTER APRI',
    'cmdk.escHint': 'ESC CHIUDI',
    'cmdk.empty': 'Nessun comando trovato.',
    'cmdk.goTo': 'Vai a',
    'cmdk.openGithub': 'Apri GitHub',
    'cmdk.copyEmail': 'Copia indirizzo email',
    'cmdk.printCv': 'Scarica il CV (PDF)',
    'cmdk.openTerminal': 'Apri terminale segreto',

    // ---- progetti ----
    'proj.details': 'DETTAGLI ＋',
    'proj.close': 'CHIUDI －',

    // ---- archivio ----
    'archive.loadingIndex': 'caricamento numeri arretrati…',
    'archive.loadingIssue': 'caricamento numero',
    'archive.openIssue': 'Apri numero',
    'archive.source': 'Fonte',
    'archive.unavailable': 'archivio momentaneamente non disponibile',
    'og.imageAlt': 'Marco Bellingeri — Cloud Platform & Security Engineer',

    // ---- appuntamenti ----
    'booking.title': 'Appuntamenti',
    'booking.note':
      'Trenta minuti, gratis, nessun impegno. Fuso orario gestito in automatico, conferma via email — niente scambi di messaggi per trovare un orario. Se poi lavoriamo insieme, la prima giornata la paghi solo se ti convince.',
    'booking.facadeLabel': 'CAL.EU — CARICATO SU RICHIESTA',
    'booking.facadeCopy':
      'Il calendario è servito da Cal.eu, una terza parte. Finché non clicchi non viene caricato nulla, e nulla lascia il tuo browser.',
    'booking.facadeCta': 'CARICA IL CALENDARIO →',
    'booking.frameTitle': 'Calendario prenotazioni',
    'booking.frameLabel': 'CLASSIFIED — PRENOTAZIONI APERTE',

    // ---- footer ----
    'foot.contacts': 'Contatti',
    'foot.online': 'Online',
    'foot.colophon': 'Colophon',
    'foot.copy': 'COPIA',
    'foot.copied': 'COPIATO ✓',
    'foot.copyError': 'ERRORE',
    'foot.setIn': 'Impaginato in Anton, Source Serif 4, JetBrains Mono.',
    'foot.printed': 'Stampato digitalmente, ovunque tu sia.',
    'foot.sealTitle': 'Sviluppato in pair programming con Claude Code',
    'foot.finePrint':
      '© Marco Bellingeri — Cloud & Security Edition. Tutti i diritti, nessun bug in produzione (si spera).',
  },
} as const;

export type UIKey = keyof (typeof ui)[typeof defaultLang];

export function useTranslations(lang: Lang) {
  return function t(key: UIKey): string {
    return ui[lang][key] ?? ui[defaultLang][key];
  };
}
