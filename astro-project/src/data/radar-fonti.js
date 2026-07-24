// Registro delle fonti del Radar — l'unica lista da cui pescano sia il Worker
// (/api/radar) sia la pagina (fallback senza JS e attribuzioni).
//
// REGOLA DI AMMISSIONE (decisa da Marco, 22-07-2026): una fonte entra SOLO se la
// sua licenza permette per iscritto il riuso commerciale — questo sito vende.
// Ogni voce porta la licenza verificata e l'URL della pagina dove sta scritto:
// l'attribuzione non è cortesia, è la condizione a cui la licenza concede l'uso.
// Il registro esteso (quote testuali, fonti scartate e perché) è in docs/FONTI.md.
//
// `hostsAmmessi` è una barriera di sicurezza: un item di feed il cui link non
// punta al dominio della fonte viene scartato dal normalizzatore — un feed
// compromesso non può trasformare il Radar in un distributore di link altrui.
//
// `itemsStatici` è per le fonti che NON sono un flusso: MITRE ATLAS è una
// tassonomia con poche release l'anno, e il suo dato sta committato in
// radar-atlas.js (generato da engine/atlas.mjs). Passa dalla stessa barriera
// di dominio dei feed: la provenienza cambia, la regola no.
import { ATLAS_CASI } from './radar-atlas.js';

export const FONTI = [
  {
    id: 'cisa',
    nome: 'CISA',
    paese: 'US',
    luogo: 'Washington, D.C.',
    lat: 38.895,
    lng: -77.0365,
    strato: 'difesa',
    feeds: ['https://www.cisa.gov/cybersecurity-advisories/all.xml'],
    kev: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    hostsAmmessi: ['www.cisa.gov', 'cisa.gov', 'github.com'],
    home: 'https://www.cisa.gov/news-events/cybersecurity-advisories',
    licenza: {
      nome: 'Pubblico dominio (17 U.S.C. §105) · KEV: CC0 1.0',
      url: 'https://github.com/cisagov/kev-data',
    },
  },
  {
    id: 'ncsc-uk',
    nome: 'NCSC',
    paese: 'GB',
    luogo: 'London',
    lat: 51.5074,
    lng: -0.1278,
    strato: 'difesa',
    feeds: [
      'https://www.ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml',
      'https://www.ncsc.gov.uk/api/1/services/v1/news-rss-feed.xml',
    ],
    hostsAmmessi: ['www.ncsc.gov.uk'],
    home: 'https://www.ncsc.gov.uk/',
    licenza: {
      nome: 'Open Government Licence v3.0',
      url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    },
  },
  {
    id: 'cert-fr',
    nome: 'CERT-FR',
    paese: 'FR',
    luogo: 'Paris',
    lat: 48.8566,
    lng: 2.3522,
    strato: 'difesa',
    feeds: ['https://www.cert.ssi.gouv.fr/alerte/feed/', 'https://www.cert.ssi.gouv.fr/avis/feed/'],
    hostsAmmessi: ['www.cert.ssi.gouv.fr'],
    home: 'https://www.cert.ssi.gouv.fr/',
    licenza: {
      nome: 'Licence Ouverte 2.0 (Etalab)',
      url: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/',
    },
  },
  {
    // Lo strato "regole": chi scrive le norme, non chi risponde agli incidenti.
    // Senza feed in v1 (nessun RSS ufficiale verificato): il punto esiste, la
    // card porta alla pagina viva dell'AI Act — nessun claim di freschezza che
    // possa invecchiare male. Upgrade path: feed ufficiale quando individuato.
    id: 'ue',
    nome: 'Commissione europea · AI Office',
    paese: 'EU',
    luogo: 'Bruxelles',
    lat: 50.8467,
    lng: 4.3517,
    strato: 'regole',
    feeds: [],
    hostsAmmessi: ['digital-strategy.ec.europa.eu'],
    home: 'https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai',
    licenza: {
      nome: 'Decisione 2011/833/UE (riuso con attribuzione)',
      url: 'https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32011D0833',
    },
  },
  {
    // CC0 sul contenuto del sito (foto e loghi esclusi, non li usiamo). Il feed
    // vero è su feeds.ncsc.nl: `www.ncsc.nl/rss` risponde 200 servendo HTML, ed
    // è un soft-404 che sarebbe passato per fonte viva e vuota.
    // Gli ADVISORY (advisories.ncsc.nl) restano FUORI: host diverso da quello
    // coperto dal CC0 e <copyright> proprio nel feed — vedi docs/FONTI.md.
    id: 'ncsc-nl',
    nome: 'NCSC Paesi Bassi',
    paese: 'NL',
    luogo: "L'Aia",
    lat: 52.0705,
    lng: 4.3007,
    strato: 'difesa',
    feeds: ['https://feeds.ncsc.nl/nieuws.rss'],
    hostsAmmessi: ['www.ncsc.nl', 'feeds.ncsc.nl'],
    home: 'https://www.ncsc.nl/',
    licenza: {
      nome: 'CC0 1.0 (Creative Commons Zero)',
      url: 'https://www.ncsc.nl/copyright',
    },
  },
  {
    // Licenza CC BY 4.0 verificata (24-07-2026), ma NIENTE feed: `/rss/` e
    // `/newsroom/rss/` sono soft-404 (200 con una pagina "Page not found") e nel
    // sorgente non c'è un solo `application/rss+xml` — il loro "Subscribe" è una
    // mailing list. Nella pagina c'è un JSON-LD con 89 alert, ma senza date: il
    // Radar ordina per data e promette "i bollettini di oggi", quindi entrerebbe
    // un elenco che non può mantenere quella promessa. Punto senza feed, come UE.
    id: 'ncsc-nz',
    nome: 'NCSC Nuova Zelanda',
    paese: 'NZ',
    luogo: 'Wellington',
    lat: -41.2866,
    lng: 174.7756,
    strato: 'difesa',
    feeds: [],
    hostsAmmessi: ['www.ncsc.govt.nz'],
    home: 'https://www.ncsc.govt.nz/alerts/',
    licenza: {
      nome: 'CC BY 4.0 · Crown copyright (Nuova Zelanda)',
      url: 'https://www.ncsc.govt.nz/legal-privacy-and-copyright/',
    },
  },
  {
    // Il rapporto internazionale sulla sicurezza dell'IA (segretariato al DSIT
    // britannico, presieduto da Bengio). Stessa licenza di NCSC UK — OGL v3.0,
    // riuso commerciale con attribuzione — verificata sul footer il 24-07-2026.
    // Nessun feed nel sorgente. Sta a Londra come NCSC UK: i due punti si
    // separano nel disegno, non nel dato (vedi posizioniVisibili in radar.astro).
    id: 'ai-safety-report',
    nome: 'International AI Safety Report',
    paese: 'GB',
    luogo: 'Londra · DSIT',
    lat: 51.4989,
    lng: -0.1345,
    strato: 'ia',
    feeds: [],
    hostsAmmessi: ['internationalaisafetyreport.org'],
    home: 'https://internationalaisafetyreport.org/',
    licenza: {
      nome: 'Open Government Licence v3.0 · © 2026 Crown copyright',
      url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    },
  },
  {
    // Lo strato "regole" americano, in simmetria con l'AI Office europeo. Il feed
    // /presidential-actions/feed/ esiste ed è valido, ma porta TUTTI gli atti
    // presidenziali: misurato il 24-07-2026, 0 item su 30 riguardavano l'IA
    // (l'ordine esecutivo di giugno era già uscito dalla finestra). Un filtro per
    // parola chiave alimenterebbe un punto vuoto il 95% del tempo, quindi niente
    // feed: la card porta alla pagina viva degli atti, nessun claim di freschezza.
    id: 'whitehouse',
    nome: 'Casa Bianca · Presidential Actions',
    paese: 'US',
    luogo: 'Washington, D.C.',
    lat: 38.8977,
    lng: -77.0365,
    strato: 'regole',
    feeds: [],
    hostsAmmessi: ['www.whitehouse.gov'],
    home: 'https://www.whitehouse.gov/presidential-actions/',
    licenza: {
      nome: 'Opera del governo federale USA — pubblico dominio',
      url: 'https://www.whitehouse.gov/copyright/',
    },
  },
  {
    // Lo strato "IA": non chi risponde agli incidenti né chi scrive le norme,
    // ma la mappa di come gli attacchi ai sistemi di IA sono andati davvero.
    // Nessun feed: ATLAS è una tassonomia versionata, non un flusso — il dato
    // è committato e si rigenera con `node engine/atlas.mjs` a ogni release.
    id: 'atlas',
    nome: 'MITRE ATLAS',
    paese: 'US',
    // MITRE ha due sedi principali: McLean (VA) e Bedford (MA). Qui Bedford,
    // perché McLean dista 12 km da CISA e alla scala del globo i due punti
    // sono lo stesso pixel — ATLAS avrebbe coperto CISA. Visto dipingendo,
    // non leggendo.
    luogo: 'Bedford, Massachusetts',
    lat: 42.4906,
    lng: -71.2767,
    strato: 'ia',
    feeds: [],
    itemsStatici: ATLAS_CASI,
    hostsAmmessi: ['atlas.mitre.org'],
    home: 'https://atlas.mitre.org/',
    licenza: {
      nome: 'Apache License 2.0 · Copyright 2021-2026 MITRE',
      url: 'https://github.com/mitre-atlas/atlas-data/blob/main/LICENSE',
    },
  },
];
