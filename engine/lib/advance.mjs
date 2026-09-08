// engine/lib/advance.mjs
// Il decisore del magazine automatico: dato lo stato della pipeline a DB,
// dice QUALE stadio eseguire adesso. Puro: niente rete, niente side effect —
// l'esecuzione (e le notifiche a Marco) stanno nel workflow.
//
// I gate umani restano dove sono: verify dei signal e approvazione del numero
// si fanno in Supabase Studio; qui si avanza solo ciò che un gesto di Marco
// ha già sbloccato. Un solo stadio per run: il più avanti vince.
// Da quanti giorni interi dura l'attesa. Serve solo ai due stadi che aspettano
// una persona: gli altri avanzano da soli, e un contatore li' non direbbe niente.
export function giorniDa(da, ora = new Date()) {
  if (!da) return null;
  const t = new Date(da).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((ora.getTime() - t) / 86_400_000));
}

export function decidi({ approvato, bozza }, ora = new Date()) {
  if (approvato) {
    if (!approvato.conArticolo) {
      return { stage: "niente", motivo: `numero ${approvato.period} approvato ma senza articolo: stato anomalo, serve un occhio umano` };
    }
    return approvato.embedded
      ? { stage: "export", arg: approvato.period }
      : { stage: "embed" };
  }
  if (bozza) {
    const giorni = giorniDa(bozza.attesaDa, ora);
    if (bozza.conArticolo) return { stage: "niente", motivo: "bozza generata: attende approvazione in Studio", giorni };
    if (bozza.conSegnaliVerificati) return { stage: "generate", arg: bozza.sector };
    return { stage: "niente", motivo: "signal in attesa di verifica in Studio", giorni };
  }
  return { stage: "niente", motivo: "nessun numero in lavorazione" };
}
