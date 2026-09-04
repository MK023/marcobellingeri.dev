#!/usr/bin/env node
// La rotta che porta clienti è ancora aperta?
//
// IL BUCO CHE CHIUDE. Dal 10-07 al 04-09-2026 il form di contatto non ha
// consegnato una sola mail: la chiave Resend nel Worker non era più valida.
// Il Worker segnalava il 401 a Sentry, ma solo quando qualcuno premeva Invia —
// e per due mesi nessuno l'ha fatto. Un controllo che parte solo se un umano lo
// attiva non è un controllo, è una coincidenza: quando è scattato, la prima
// volta, aveva già due mesi di ritardo.
//
// PERCHE' NON SERVE NESSUN SEGRETO QUI. La domanda non è «la mia chiave è
// valida» ma «è valida quella del Worker», che è una copia diversa. Chiedere a
// una chiave in CI di rispondere per un'altra è ciò che avrebbe tenuto tutto
// verde. Quindi la sonda non porta credenziali: interroga la rotta pubblica e
// muta `/api/contact-health`, e la credenziale la prova il Worker su se stesso.
//
// PERCHE' STA DENTRO `sentinella-cron` E NON IN UN WORKFLOW SUO. La tabella di
// `scripts/healthchecks.mjs` accetta solo finestre derivate da un `gap` MISURATO
// su run reali; un workflow nuovo non ne ha, e inventarlo contraddirebbe la
// dottrina scritta lì. Ospitata dalla sentinella, la sonda eredita uno schedule
// quotidiano già misurato e un monitor già configurato.
//
// TRE ESITI, NON DUE. «Chiuso» e «non lo so» sono cose diverse e vanno dette
// diverse: la issue che questo script fa aprire viene deduplicata, quindi UNA
// diagnosi sbagliata lascia aperta una issue che zittisce la sonda finché un
// umano non la chiude — cioè ricrea il silenzio che tutto questo esiste per
// togliere. Un 429 (il nostro stesso rate limit), un 502 dell'edge o la rete che
// cade non sono un canale chiuso: sono una sonda che non ha potuto rispondere.
//
//   node scripts/sonda-contatto.mjs              # esce 1 se il canale non è sano
//   node scripts/sonda-contatto.mjs --self-check # verifica la logica, niente rete
const URL_SONDA = process.env.SONDA_URL || 'https://marcobellingeri.dev/api/contact-health';
const TENTATIVI = 2;

// `ok` deve essere vero ED esplicito: una risposta che non è JSON, o che è JSON
// senza quel campo, non è un via libera. È il modo in cui una pagina d'errore
// dell'edge, che risponde 200 con dell'HTML, passerebbe per «tutto bene».
export function esitoDa(status, corpo) {
  // Il nostro rate limit e gli errori dell'infrastruttura non sono un verdetto
  // sul canale: sono l'assenza di un verdetto.
  if (status === 429) return { stato: 'incerto', perche: 'la sonda è stata frenata dal rate limit (429)' };
  if (status === 0) return { stato: 'incerto', perche: `la sonda non ha raggiunto il Worker: ${corpo}` };
  if (status !== 200 && status !== 503) return { stato: 'incerto', perche: `risposta inattesa HTTP ${status}` };
  try {
    const { ok } = JSON.parse(corpo);
    if (ok === true) return { stato: 'aperto', perche: 'il Worker si fa accettare da Resend' };
    if (ok === false) return { stato: 'chiuso', perche: 'il Worker NON si fa accettare da Resend' };
    return { stato: 'incerto', perche: 'JSON senza il campo ok' };
  } catch {
    return { stato: 'incerto', perche: 'risposta non JSON' };
  }
}

if (process.argv.includes('--self-check')) {
  const casi = [
    [200, '{"ok":true}', 'aperto'],
    [503, '{"ok":false}', 'chiuso'],
    [200, '{"ok":false}', 'chiuso'],
    [429, '{"ok":false}', 'incerto'],   // il nostro limite, non un guasto
    [502, 'bad gateway', 'incerto'],
    [0, 'ECONNREFUSED', 'incerto'],
    [200, '<html>errore edge</html>', 'incerto'],
    [200, '{}', 'incerto'],
  ];
  for (const [status, corpo, atteso] of casi) {
    const { stato } = esitoDa(status, corpo);
    if (stato !== atteso) {
      console.error(`self-check fallito: ${status} ${corpo} -> ${stato}, atteso ${atteso}`);
      process.exit(1);
    }
  }
  console.log(`self-check ok (${casi.length} casi)`);
  process.exit(0);
}

async function interroga() {
  try {
    const r = await fetch(URL_SONDA, { headers: { 'User-Agent': 'sonda-contatto' } });
    return esitoDa(r.status, await r.text());
  } catch (e) {
    return esitoDa(0, String(e.message ?? e));
  }
}

// Si ritenta solo l'incerto: un «chiuso» è un verdetto del Worker e ripeterlo
// non lo cambia, mentre un blip di rete sparisce al secondo colpo.
let esito = await interroga();
for (let i = 1; i < TENTATIVI && esito.stato === 'incerto'; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  esito = await interroga();
}

console.log(`${esito.stato.toUpperCase()}: ${esito.perche} (${URL_SONDA})`);
if (esito.stato === 'aperto') process.exit(0);

if (esito.stato === 'chiuso') {
  // Il messaggio è per chi legge la issue: deve dire cosa fare, non solo che
  // qualcosa non va.
  console.error('Il form di contatto non consegna. Rigenera la chiave su Resend e riscrivila');
  console.error('nei DUE posti che la tengono: il Worker (`npx wrangler secret put RESEND_API_KEY`)');
  console.error('e Doppler. Il deploy non le sincronizza, quindi allinearne una sola non basta.');
} else {
  console.error(`La sonda non ha ottenuto un verdetto in ${TENTATIVI} tentativi.`);
  console.error('Non vuol dire che il form sia rotto: vuol dire che non lo sappiamo.');
  console.error('Se si ripete, il difetto è nella sonda o nella rotta, non nella chiave.');
}
process.exit(1);
