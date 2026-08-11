import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mapRadar, aTema } from "../lib/radar-signals.mjs";

// Forma reale della risposta di /api/radar (catturata il 24-07-2026): fonti
// con items (titolo/url/data), piu' i casi che il mapper deve scartare — la
// fonte senza feed (items vuoti) e il KEV, che non ha URL per item.
const FONTI = [
  {
    id: "cisa", nome: "CISA", strato: "difesa",
    items: [
      { titolo: "AI-enabled intrusion in ICS environments", url: "https://www.cisa.gov/news-events/ics-advisories/icsa-26-202-01", data: "2026-07-21" },
      { titolo: "Doppione via URL identico, sempre AI", url: "https://www.cisa.gov/news-events/ics-advisories/icsa-26-202-01", data: "2026-07-21" },
    ],
    kev: [{ cve: "CVE-2026-1234", nome: "niente url: fuori", data: "2026-07-20" }],
  },
  { id: "ue", nome: "Commissione europea · AI Office", strato: "regole", items: [] },
  {
    id: "atlas", nome: "MITRE ATLAS", strato: "ia",
    items: [{ titolo: "EchoLeak: Zero-Click Prompt Injection", url: "https://atlas.mitre.org/studies/AML.CS0059", data: "2026-06-13" }],
  },
];

test("radar-signals: un item -> una riga discovery, tier e independent NULL come da ADR", () => {
  const righe = mapRadar(FONTI);
  assert.equal(righe.length, 2, "dedup per url within-batch + KEV e fonti vuote fuori");
  const [cisa, atlas] = righe;
  assert.equal(cisa.source_url, "https://www.cisa.gov/news-events/ics-advisories/icsa-26-202-01");
  assert.equal(cisa.source_name, "CISA — AI-enabled intrusion in ICS environments");
  assert.equal(cisa.category, "radar");
  assert.equal(cisa.stage, "discovery");
  assert.equal(cisa.tier, null, "il tier lo assegna il verify umano, non il radar");
  assert.equal(cisa.independent, null);
  assert.equal(atlas.source_name, "MITRE ATLAS — EchoLeak: Zero-Click Prompt Injection");
});

test("radar-signals: raw_content porta titolo e data (dato, mai istruzioni)", () => {
  const [r] = mapRadar(FONTI);
  assert.match(r.raw_content, /AI-enabled intrusion/);
  assert.match(r.raw_content, /2026-07-21/);
});

// ---- il vaglio tematico -------------------------------------------------

// Il Radar aggrega per il globo del sito, dove un avviso su MikroTik ha senso.
// Il numero del magazine ha un tema, e sul numero di agosto 25 signal su 37
// erano avvisi di prodotto: non candidati-prova, lavoro di triage per l'umano.
test("aTema: una tassonomia AI entra sempre, anche se il titolo non nomina l'AI", () => {
  assert.equal(aTema("MITRE ATLAS", "OpenClaw 1-Click Remote Code Execution"), true);
  assert.equal(aTema("MITRE ATLAS", "RCE Vulnerability in Semantic Kernel Search Plugin"), true);
});

test("aTema: un CERT entra solo quando parla di AI", () => {
  assert.equal(aTema("NCSC", "The AI shift in cyber risk: why leaders must act now"), true);
  assert.equal(aTema("CERT-FR", "Vulnérabilité dans Moodle (23 juillet 2026)"), false);
  assert.equal(aTema("CISA", "Schneider Electric IGSS"), false);
  assert.equal(aTema("NCSC Paesi Bassi", "Kritieke kwetsbaarheden in Adobe Campaign Classic"), false);
});

// `AI` maiuscolo e non /ai/i: i bollettini CERT-FR sono pieni di "j'ai", e in
// italiano "ai" e' una preposizione. Un match case-insensitive farebbe entrare
// mezzo Radar dalla porta di servizio.
test("aTema: 'j'ai' e 'ai' non sono l'AI", () => {
  assert.equal(aTema("CERT-FR", "Le CERT-FR a publié un avis, j'ai vérifié les correctifs"), false);
  assert.equal(aTema("CISA", "Aggiornamenti ai prodotti Schneider"), false);
});

test("mapRadar: gli avvisi fuori tema non entrano nel numero", () => {
  const misto = [{ id: "certfr", nome: "CERT-FR", items: [
    { titolo: "Vulnérabilité dans Traefik", url: "https://cert.ssi.gouv.fr/a", data: "2026-07-09" },
    { titolo: "Multiples vulnérabilités dans les modèles de langage embarqués", url: "https://cert.ssi.gouv.fr/b", data: "2026-07-10" },
  ] }];
  const righe = mapRadar(misto);
  assert.equal(righe.length, 1, "l'avviso di prodotto non e' un candidato-prova");
  assert.match(righe[0].source_url, /\/b$/);
});

test("radar-signals: item senza url o con url malformato = fuori, non esplode", () => {
  // Titoli a tema apposta: qui si verifica il vaglio sull'URL, non quello
  // tematico — un fixture fuori tema li farebbe passare per il motivo sbagliato.
  const rotte = [{ id: "x", nome: "X", items: [
    { titolo: "AI senza url", data: "2026-01-01" },
    { titolo: "AI con url rotto", url: "ht!tp:::/", data: "2026-01-01" },
    { titolo: "AI buono", url: "https://example.gov/a", data: "2026-01-01" },
  ] }];
  const righe = mapRadar(rotte);
  assert.equal(righe.length, 1);
  assert.equal(righe[0].source_url, "https://example.gov/a");
});

test("radar-signals: source_name tagliato a 200, payload vuoto -> lista vuota", () => {
  const lungo = [{ id: "x", nome: "X".repeat(150), items: [{ titolo: `AI ${"Y".repeat(150)}`, url: "https://example.gov/b", data: null }] }];
  assert.ok(mapRadar(lungo)[0].source_name.length <= 200);
  assert.deepEqual(mapRadar([]), []);
  assert.deepEqual(mapRadar(undefined), []);
});

// ---- CLI (spawn, zero rete: fetch-mock) ---------------------------------

import { runEngine } from "./helpers/spawn.mjs";

const RADAR = { fonti: [{ id: "cisa", nome: "CISA", items: [
  { titolo: "AI advisory X", url: "https://www.cisa.gov/a", data: "2026-07-24" },
  { titolo: "AI advisory Y", url: "https://www.cisa.gov/b", data: "2026-07-23" },
] }] };

test("radar-signals --dry: stampa i candidati e non scrive nulla", () => {
  const r = runEngine(["engine/radar-signals.mjs", "--dry"], [{ match: "api/radar", body: RADAR }]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /2 bollettini a tema su 2 dal Radar/);
  assert.match(r.stdout, /\[dry\] https:\/\/www\.cisa\.gov\/a/);
  // nessuna rotta Supabase mockata: se scrivesse, il figlio morirebbe con "fetch non mockata"
});

test("radar-signals: senza numero draft esce a mani vuote, exit 0", () => {
  const r = runEngine(["engine/radar-signals.mjs"], [
    { match: "api/radar", body: RADAR },
    { match: "issues?select", body: [] },
  ]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /nessun numero .* esco senza scrivere/);
});

test("radar-signals: col draft aggancia i nuovi e salta i gia' visti", () => {
  const r = runEngine(["engine/radar-signals.mjs"], [
    { match: "api/radar", body: RADAR },
    { match: "issues?select", body: [{ id: "i-1", number: 3, status: "draft" }] },
    { match: "signals?select", body: [{ source_url: "https://www.cisa.gov/a" }] }, // gia' sul numero
    { match: "signals", method: "POST", body: [] },
  ]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /1 nuovi candidati-prova su #3 \(1 gia' visti\)/);
});

test("radar-signals: /api/radar giu' -> errore chiaro ed exit 1", () => {
  const r = runEngine(["engine/radar-signals.mjs"], [{ match: "api/radar", status: 503, body: "giu" }]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /api\/radar -> HTTP 503/);
});
