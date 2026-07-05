// Dizionario stringhe UI (chrome del sito) — punto d'estensione condiviso per
// i18n. Qui vivono SOLO le stringhe di interfaccia (meta, a11y, loader): il body
// delle sezioni è tradotto nei rispettivi componenti in un secondo momento.
// C4 (switcher lingua) si appoggia a `languages` e a getRelativeLocaleUrl.

export const languages = {
  en: 'English',
  it: 'Italiano',
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = 'en';

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
    'sec.present': 'ON',
    'sec.missing': '—',
    'sec.note': 'Headers are applied at the edge (Cloudflare) and read live from this page’s response — locally they may show as missing.',
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
    'sec.present': 'ON',
    'sec.missing': '—',
    'sec.note': 'Gli header sono applicati all’edge (Cloudflare) e letti live dalla risposta di questa pagina — in locale possono risultare assenti.',
  },
} as const;

export type UIKey = keyof (typeof ui)[typeof defaultLang];

export function useTranslations(lang: Lang) {
  return function t(key: UIKey): string {
    return ui[lang][key] ?? ui[defaultLang][key];
  };
}
