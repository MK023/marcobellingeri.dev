// Radar -> signals: i bollettini che il Radar gia' aggrega (fonti con licenza
// verificata in docs/FONTI.md) diventano candidati-prova del magazine, nello
// STESSO modello a due stadi di ingest: stage='discovery', tier e independent
// NULL — il verify col tier resta umano, e il gate a DB (0006) non si tocca.
// Niente migration: category='radar' e' la provenienza, lo schema basta.
//
// Il KEV resta fuori: nel payload i suoi item non hanno un url per voce, e
// signals.source_url e' NOT NULL. Se un giorno serve, l'upgrade path e' il
// link al record CVE — deciso allora, non inventato ora.
export function mapRadar(fonti) {
  const visti = new Set();
  const righe = [];
  for (const f of fonti ?? []) {
    for (const i of f.items ?? []) {
      if (!i.url) continue;
      try { new URL(i.url); } catch { continue; } // url malformato = rumore
      if (visti.has(i.url)) continue;
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
