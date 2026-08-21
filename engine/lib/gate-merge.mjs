// Decide se la PR della card e' pronta per il merge automatico. Puro: chi
// interroga GitHub e chi mergia e' il workflow edicola-card.
// I tre check richiesti verdi NON bastano: GitHub ricalcola la mergiabilita'
// in modo asincrono, e nella finestra fra il terzo verde e il ricalcolo la PR
// risponde ancora BLOCKED. Mergiare li' dentro e' il difetto del 2026-08-21.
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
