// Radar -> signals: i bollettini che il Radar gia' aggrega (fonti con licenza
// verificata in docs/FONTI.md) diventano candidati-prova del magazine, nello
// STESSO modello a due stadi di ingest: stage='discovery', tier e independent
// NULL — il verify col tier resta umano, e il gate a DB (0006) non si tocca.
// Niente migration: category='radar' e' la provenienza, lo schema basta.
//
// Il KEV resta fuori: nel payload i suoi item non hanno un url per voce, e
// signals.source_url e' NOT NULL. Se un giorno serve, l'upgrade path e' il
// link al record CVE — deciso allora, non inventato ora.
// Il Radar aggrega per il globo del sito, dove un avviso su MikroTik e' al suo
// posto. Il numero del magazine ha un tema, e senza vaglio ci finiva dentro
// tutto: sul numero di agosto, 25 signal su 37 erano avvisi di prodotto
// (Moodle, Traefik, Schneider, NASA cFS) con 30-140 char di contenuto. Non
// candidati-prova: lavoro di triage scaricato sull'umano del verify.
//
// Il vaglio guarda la FONTE prima del titolo. ATLAS e' una tassonomia di
// AI-security: ogni sua voce e' a tema per costruzione, anche quando il titolo
// non nomina l'AI ("OpenClaw 1-Click Remote Code Execution"). I CERT emettono
// avvisi di prodotto per mestiere, e entrano solo quando parlano di AI.
//
// Questo NON e' un gate di pubblicazione: quello resta il verify umano (0006).
// E' il filtro d'ingresso al triage, e la sua unica promessa e' non riempire
// il numero di roba che l'umano dovrebbe scartare a mano ogni mese.
const FONTE_A_TEMA = /atlas/i;
// Due regex e non una: `AI` va cercato MAIUSCOLO, e un solo flag `i` in fondo
// si applicherebbe anche a lui — i bollettini CERT-FR sono pieni di "j'ai" e in
// italiano "ai" e' una preposizione. Con la regex unica entrava mezzo Radar
// dalla porta di servizio (misurato: il test su "j'ai vérifié" passava).
const TEMA_AI = /\bAI\b/;
// Le fonti scrivono nella loro lingua: CERT-FR in francese, NCSC-NL in
// olandese. Cercare solo le forme inglesi perderebbe l'avviso proprio quando e'
// a tema. `mod[eè]l` copre model/modèle/modellen con una lettera di differenza.
const TEMA = /\b(?:llm|genai|machine learning|prompt|mod[eè]l|agentic|copilot|chatbot|neural|intelligence artificielle|kunstmatige intelligentie|intelligenza artificiale)/i;

export function aTema(fonte, titolo) {
  const t = titolo ?? "";
  return FONTE_A_TEMA.test(fonte ?? "") || TEMA_AI.test(t) || TEMA.test(t);
}

export function mapRadar(fonti) {
  const visti = new Set();
  const righe = [];
  for (const f of fonti ?? []) {
    for (const i of f.items ?? []) {
      if (!i.url) continue;
      try { new URL(i.url); } catch { continue; } // url malformato = rumore
      if (visti.has(i.url)) continue;
      if (!aTema(f.nome, i.titolo)) continue;
      visti.add(i.url);
      righe.push({
        source_url: i.url,
        source_name: `${f.nome} — ${i.titolo}`.slice(0, 200),
        category: "radar",
        stage: "discovery",
        tier: null,
        independent: null,
        relevance: null,
        // raw_content e' testo di terzi NON fidato: in generazione = dato,
        // mai istruzioni (stessa regola di ingest).
        raw_content: `${i.titolo}${i.data ? ` (${i.data})` : ""}`.slice(0, 2000),
      });
    }
  }
  return righe;
}
