#!/usr/bin/env node
// Guardia sulla guardia: la sentinella E2E di llm-council gira ancora?
//
// Quel repo ha un cron settimanale che interroga l'API vera. Se fallisce, la run
// rossa lo dice. Se NON PARTE, non lo dice nessuno — e GitHub disabilita gli
// schedule dopo 60 giorni di inattivita' sul repository, in silenzio. llm-council
// e' un progetto a sprint: due mesi fermo e' normale, quindi lo scenario e' reale.
//
// Il posto giusto per accorgersene e' qui e non li': questo sito ha attivita' quasi
// quotidiana, quindi i SUOI schedule non scadono mai. Una guardia che muore dello
// stesso male che sorveglia non e' una guardia.
//
// La strada canonica sarebbe un cron monitor Sentry, che si allarma sull'assenza di
// un segnale. Non e' percorribile: Sentry include **un solo** cron monitor per piano
// e su account free il seggio e' occupato da supabase-keepalive. Questo e' il
// sostituto a costo zero.
//
// Legge l'API GitHub **senza token**: i workflow run di un repo pubblico sono
// leggibili in anonimo, quindi non serve un PAT cross-repo e non nasce una
// credenziale long-lived da custodire.
//
//   node scripts/sentinella-e2e-council.mjs              # esce 1 se la sentinella tace
//   node scripts/sentinella-e2e-council.mjs --self-check # verifica la logica, niente rete

const REPO = 'MK023/llm-council';
const WORKFLOW = 'e2e.yml';

// La sentinella e' settimanale (lunedi' 06:00 UTC). 10 giorni = una settimana piu'
// tre di margine: un ritardo del runner o uno slittamento non aprono una issue,
// due settimane di silenzio si'.
const GIORNI_LIMITE = 10;

// Si guardano solo le run `schedule`, non tutte. Una `workflow_dispatch` dimostra
// che il workflow funziona, non che il CRON scatta — ed e' proprio il cron la cosa
// che si spegne da sola. Contarla azzererebbe il contatore proprio mentre il caso
// da scoprire sta succedendo.
const EVENTO = 'schedule';

// La conclusione non conta: una run rossa e' comunque la prova che il cron ha
// sparato, e di quel rosso si lamenta gia' Actions. Qui si misura il battito.
const API = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?event=${EVENTO}&per_page=1`;

/** Giorni interi tra due istanti ISO. Estratta per poterla verificare senza rete. */
export function giorniDa(iso, adesso) {
  return Math.floor((adesso.getTime() - new Date(iso).getTime()) / 86_400_000);
}

/** Verdetto sulla sentinella. `ultimaRun` null = nessuna run schedulata trovata. */
export function verdetto(ultimaRun, adesso, limite = GIORNI_LIMITE) {
  if (!ultimaRun) {
    return { viva: false, giorni: null, motivo: 'nessuna run schedulata trovata' };
  }
  const giorni = giorniDa(ultimaRun, adesso);
  return {
    viva: giorni <= limite,
    giorni,
    motivo: `ultima run schedulata ${giorni} giorni fa (limite ${limite})`,
  };
}

async function ultimaRunSchedulata() {
  const risposta = await fetch(API, { headers: { accept: 'application/vnd.github+json' } });
  if (!risposta.ok) throw new Error(`API GitHub ${risposta.status}`);
  const dati = await risposta.json();
  return dati.workflow_runs?.[0]?.created_at ?? null;
}

async function selfCheck() {
  const { strict: assert } = await import('node:assert');
  const adesso = new Date('2026-08-13T00:00:00Z');

  assert.equal(giorniDa('2026-08-10T00:00:00Z', adesso), 3);
  assert.equal(giorniDa('2026-08-13T00:00:00Z', adesso), 0);

  assert.equal(verdetto('2026-08-10T00:00:00Z', adesso).viva, true, 'tre giorni fa: viva');
  assert.equal(verdetto('2026-08-03T00:00:00Z', adesso).viva, true, 'dieci giorni: esattamente al limite');
  assert.equal(verdetto('2026-08-02T00:00:00Z', adesso).viva, false, 'undici giorni: muta');
  // Il caso che conta: nessuna run schedulata non e' "va tutto bene".
  assert.equal(verdetto(null, adesso).viva, false, 'nessuna run: muta');

  console.log('self-check: ok');
}

async function main() {
  if (process.argv.includes('--self-check')) return selfCheck();

  const ultima = await ultimaRunSchedulata();
  const esito = verdetto(ultima, new Date());
  console.log(`${REPO} ${WORKFLOW}: ${esito.motivo}`);

  if (!esito.viva) {
    console.error(`::error::La sentinella E2E di ${REPO} non gira piu': ${esito.motivo}`);
    process.exitCode = 1;
  }
}

main().catch((errore) => {
  // Un errore di rete non e' una sentinella morta: non si apre una issue per un
  // 503 di api.github.com. Si segnala e si esce puliti.
  console.error(`::warning::controllo non riuscito: ${errore.message}`);
});
