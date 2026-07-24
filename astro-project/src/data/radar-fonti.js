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
