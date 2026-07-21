// engine/lib/advance.mjs
// Il decisore del magazine automatico: dato lo stato della pipeline a DB,
// dice QUALE stadio eseguire adesso. Puro: niente rete, niente side effect —
// l'esecuzione (e le notifiche a Marco) stanno nel workflow.
//
// I gate umani restano dove sono: verify dei signal e approvazione del numero
// si fanno in Supabase Studio; qui si avanza solo ciò che un gesto di Marco
// ha già sbloccato. Un solo stadio per run: il più avanti vince.
export function decidi({ approvato, bozza }) {
  if (approvato) {
    if (!approvato.conArticolo) {
      return { stage: "niente", motivo: `numero ${approvato.period} approvato ma senza articolo: stato anomalo, serve un occhio umano` };
    }
    return approvato.embedded
      ? { stage: "export", arg: approvato.period }
      : { stage: "embed" };
  }
  if (bozza) {
    if (bozza.conArticolo) return { stage: "niente", motivo: "bozza generata: attende approvazione in Studio" };
    if (bozza.conSegnaliVerificati) return { stage: "generate", arg: bozza.sector };
    return { stage: "niente", motivo: "signal in attesa di verifica in Studio" };
  }
  return { stage: "niente", motivo: "nessun numero in lavorazione" };
}
