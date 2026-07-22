// La parte PURA del judge: parsing del caso, rubrica, e — soprattutto — la
// POLITICA del gate in una funzione testata a secco. La regola di casa: un
// gate senza una politica scritta di cosa blocca è un futuro continue-on-error.
//
// La politica, per iscritto:
//   BOCCIA  -> un difetto deterministico (file mancante, campo vuoto) oppure
//              un criterio della rubrica a voto <= 2, oppure un criterio
//              assente dalla risposta del modello (fail-closed).
//   AVVISA  -> un criterio a 3: migliorabile, non rotto. Il gate boccia il
//              rotto, non il migliorabile — altrimenti diventa rumore e poi
//              qualcuno lo spegne.
//   PROMUOVE-> tutto il resto. Il judge non riscrive e non decide il merge:
//              il contenuto lo merge Marco, col referto sotto gli occhi.

export const CRITERI = ["parita", "ancoraggio", "answer_first", "stile", "lezione"];

// Frontmatter del magazine: scalari JSON scritti da export.mjs (virgolette e
// newline sono escapati) — si parsa il valore con JSON.parse, non a occhio.
export function parseCaso(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error("frontmatter mancante");
  const campo = (k) => {
    const riga = m[1].match(new RegExp(`^${k}: (".*")\\s*$`, "m"))?.[1];
    if (!riga) throw new Error(`frontmatter incompleto: manca ${k}`);
    return JSON.parse(riga);
  };
  return {
    lang: campo("lang"),
    title: campo("title"),
    problem: campo("problem"),
    approach: campo("approach"),
    result: campo("result"),
    lesson: campo("lesson"),
  };
}

// Schema imposto al modello: un voto motivato per ogni criterio, più una nota.
export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["criteri", "nota"],
  properties: {
    criteri: {
      type: "object",
      additionalProperties: false,
      required: CRITERI,
      properties: Object.fromEntries(
        CRITERI.map((c) => [c, {
          type: "object",
          additionalProperties: false,
          required: ["voto", "motivo"],
          properties: {
            voto: { type: "integer", minimum: 1, maximum: 5 },
            motivo: { type: "string", maxLength: 300 },
          },
        }]),
      ),
    },
    nota: { type: "string", maxLength: 400 },
  },
};

export function verdetto({ difetti, criteri }) {
  const motivi = [...difetti];
  const avvisi = [];
  for (const c of CRITERI) {
    const r = criteri?.[c];
    if (!r || typeof r.voto !== "number") {
      motivi.push(`${c}: criterio assente dalla risposta del giudice (fail-closed)`);
      continue;
    }
    if (r.voto <= 2) motivi.push(`${c} (${r.voto}/5): ${r.motivo}`);
    else if (r.voto === 3) avvisi.push(`${c} (3/5): ${r.motivo}`);
  }
  return { esito: motivi.length ? "bocciato" : "promosso", motivi, avvisi };
}
