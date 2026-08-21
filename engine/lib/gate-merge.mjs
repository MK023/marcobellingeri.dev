// Decide se la PR della card e' pronta per il merge automatico. Puro: chi
// interroga GitHub e chi mergia e' il workflow edicola-card.
// I tre check richiesti verdi NON bastano: "verdi" e "mergiabile" sono due
// domande diverse, e la risposta alla seconda vive nel mergeStateStatus. Una PR
// puo' restare BLOCKED coi tre verdi addosso — per esempio quando le sue check
// suite `pull_request` sono parcheggiate in action_required (vedi la testata di
// edicola-card.yml, che e' il difetto vero del 2026-08-21). Questo gate non
// sistema quel caso: aspetta invece di mergiare al buio, e a tempo scaduto si
// ferma lasciando la PR aperta e la issue al workflow.
const MERGIABILI = new Set(["CLEAN", "UNSTABLE"]);
const SENZA_RITORNO = new Set(["DIRTY", "BEHIND"]);

export function decidiMerge({ checkRuns, richiesti, statoMerge, tentativiRimasti }) {
  const nomi = new Set(richiesti);
  const nostri = checkRuns.filter((c) => nomi.has(c.name));

  if (nostri.some((c) => c.status === "completed" && c.conclusion !== "success")) {
    return { azione: "ferma", motivo: "un check richiesto e' rosso" };
  }

  // Set e non conteggio: un check ripetuto sullo stesso commit non vale doppio,
  // e zero check trovati non e' verde (e' il falso verde della PR appena aperta).
  const verdi = new Set(
    nostri.filter((c) => c.status === "completed" && c.conclusion === "success").map((c) => c.name),
  );
  if (verdi.size < richiesti.length) {
    return { azione: "aspetta", motivo: `check richiesti ${verdi.size}/${richiesti.length} verdi` };
  }

  if (SENZA_RITORNO.has(statoMerge)) {
    return { azione: "ferma", motivo: `stato ${statoMerge}: aspettare non lo risolve` };
  }
  if (MERGIABILI.has(statoMerge)) {
    return { azione: "mergia", motivo: `stato ${statoMerge}` };
  }
  if (tentativiRimasti <= 0) {
    return { azione: "ferma", motivo: `tempo scaduto con stato ${statoMerge}` };
  }
  return { azione: "aspetta", motivo: `stato ${statoMerge}: GitHub sta ancora ricalcolando` };
}
