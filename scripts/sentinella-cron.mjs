#!/usr/bin/env node
// Guardia sui cron che non hanno un monitor: sono ancora partiti?
//
// IL BUCO CHE CHIUDE. Un errore si vede: lo script fallisce, `catchTopLevel` manda
// l'evento a Sentry, il workflow apre la issue. Un cron che NON PARTE non produce
// niente da vedere — e GitHub disabilita gli schedule dopo 60 giorni di inattivita'
// sul repository, in silenzio. La strada canonica sarebbe un cron monitor Sentry,
// che si allarma sull'ASSENZA di un check-in. Non e' percorribile: Sentry include
// **un solo** cron monitor per piano e su account free il seggio e' occupato da
// `supabase-keepalive` — verificato via API il 2026-08-13, gli altri tre monitor
// esistono, ricevono i check-in e restano `disabled`.
//
// Quindi il pattern qui e' rovesciato, e vale la pena dirlo perche' fra sei mesi
// sembrerebbe un downgrade: **un guardiano ATTIVO che manda un evento**, invece di
// un monitor passivo che aspetta un segnale. Un evento di errore si allarma su
// qualcosa che e' successo, un cron monitor sull'assenza di qualcosa — sono cose
// diverse, e per coprire l'assenza con un evento serve comunque qualcuno che se ne
// accorga. Quel qualcuno e' questo script. La quota errori del piano free e' ampia
// e quasi inutilizzata; i seggi cron sono uno.
//
// PERCHE' VIVE QUI. Questo sito ha attivita' quasi quotidiana, quindi i SUOI
// schedule non scadono mai. Una guardia che muore dello stesso male che sorveglia
// non e' una guardia — ed e' anche il motivo per cui llm-council, che va a sprint,
// non puo' sorvegliarsi da solo.
//
// CHI SORVEGLIA IL GUARDIANO (risolto il 14-08, senza spostare il seggio Sentry).
// Il problema era circolare: questo script vede gli altri cron tacere, ma se tace LUI
// non se ne accorge nessuno. La soluzione non e' spostare l'unico monitor attivo — che
// sta su `supabase-keepalive`, dove un DB in pausa costa piu' di tutto il resto e
// perderebbe il suo allarme diretto. E' la COPERTURA RECIPROCA:
//
//   questo guardiano  -> sorveglia i tre cron muti E `supabase-keepalive`
//   `supabase-keepalive` -> lancia questo stesso script, quindi sorveglia il guardiano
//   il monitor Sentry attivo -> sorveglia `supabase-keepalive`
//
// Ogni anello ha qualcuno sopra, e nessun seggio cambia mano. Il keepalive gira ogni
// tre giorni ed e' il piu' affidabile della catena proprio perche' e' l'unico con un
// allarme passivo vero.
//
//   node scripts/sentinella-cron.mjs              # esce 1 se qualcuno tace
//   node scripts/sentinella-cron.mjs --self-check # verifica la logica, niente rete

import { captureException } from "../engine/lib/sentry.mjs";

// I cron sorvegliati. Il limite e' il periodo piu' un margine: uno slittamento del
// runner non deve aprire una issue, due periodi di silenzio si'.
const SORVEGLIATI = [
  {
    slug: "llm-council-e2e",
    periodo: 7, // giorni fra due run schedulate
    repo: "MK023/llm-council",
    workflow: "e2e.yml",
    limite: 10, // settimanale (lun 06:00 UTC) + 3 giorni
    cosa: "l'E2E settimanale del council contro l'API vera",
  },
  {
    slug: "visibility",
    periodo: 7, // giorni fra due run schedulate
    repo: "MK023/marcobellingeri.dev",
    workflow: "visibility.yml",
    limite: 10, // settimanale (lun 06:00 UTC) + 3 giorni
    cosa: "la raccolta settimanale dei dati di visibilita'",
  },
  {
    slug: "magazine-ingest",
    periodo: 31, // giorni fra due run schedulate
    repo: "MK023/marcobellingeri.dev",
    workflow: "magazine-ingest.yml",
    limite: 40, // mensile (il 1° alle 06:00 UTC) + 9 giorni
    cosa: "l'ingestione mensile del magazine",
  },
  {
    // In lista dal 14-08 anche se HA il monitor attivo: e' l'anello che sorveglia il
    // guardiano, e un anello portante va guardato da entrambe le parti. La ridondanza
    // qui e' il punto, non il rumore.
    slug: "supabase-keepalive",
    periodo: 3, // giorni fra due run schedulate
    repo: "MK023/marcobellingeri.dev",
    workflow: "supabase-keepalive.yml",
    limite: 5, // ogni 3 giorni + 2
    cosa: "il keepalive che tiene il DB fuori dalla pausa",
  },
  {
    // Il guardiano guarda anche se stesso: da solo non servirebbe a niente — se non
    // parte, non puo' accorgersene. Serve perche' questo script gira anche DENTRO
    // supabase-keepalive, e li' la riga diventa l'unico occhio sul guardiano.
    slug: "sentinella-cron",
    periodo: 1, // giorni fra due run schedulate
    repo: "MK023/marcobellingeri.dev",
    workflow: "sentinella-cron.yml",
    limite: 3, // giornaliero + 2
    cosa: "il guardiano stesso, visto da chi lo ospita",
  },
];

// Si guardano solo le run `schedule`, non tutte. Una `workflow_dispatch` dimostra
// che il workflow funziona, non che il CRON scatta — ed e' proprio il cron la cosa
// che si spegne da sola. Contarla azzererebbe il contatore proprio mentre il caso
// da scoprire sta succedendo.
const EVENTO = "schedule";

/** Un cron che ha smesso di sparare. Il nome finisce nel titolo dell'issue Sentry. */
class CronMuto extends Error {
  name = "CronMuto";
}

/** Giorni interi tra due istanti ISO. Estratta per poterla verificare senza rete. */
export function giorniDa(iso, adesso) {
  return Math.floor((adesso.getTime() - new Date(iso).getTime()) / 86_400_000);
}

/** Verdetto su un cron. `ultimaRun` null = nessuna run schedulata trovata. */
export function verdetto(ultimaRun, adesso, limite) {
  if (!ultimaRun) {
    return { viva: false, giorni: null, motivo: "nessuna run schedulata trovata" };
  }
  const giorni = giorniDa(ultimaRun, adesso);
  return {
    viva: giorni <= limite,
    giorni,
    motivo: `ultima run schedulata ${giorni} giorni fa (limite ${limite})`,
  };
}

/** I workflow run di un repo PUBBLICO si leggono in anonimo: niente PAT cross-repo. */
async function ultimaRunSchedulata({ repo, workflow }) {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs?event=${EVENTO}&per_page=1`;
  const risposta = await fetch(url, { headers: { accept: "application/vnd.github+json" } });
  if (!risposta.ok) throw new Error(`API GitHub ${risposta.status} per ${repo}/${workflow}`);
  const dati = await risposta.json();
  return dati.workflow_runs?.[0]?.created_at ?? null;
}

async function selfCheck() {
  const { strict: assert } = await import("node:assert");
  const adesso = new Date("2026-08-13T00:00:00Z");

  assert.equal(giorniDa("2026-08-10T00:00:00Z", adesso), 3);
  assert.equal(giorniDa("2026-08-13T00:00:00Z", adesso), 0);

  assert.equal(verdetto("2026-08-10T00:00:00Z", adesso, 10).viva, true, "tre giorni fa: viva");
  assert.equal(verdetto("2026-08-03T00:00:00Z", adesso, 10).viva, true, "dieci giorni: al limite");
  assert.equal(verdetto("2026-08-02T00:00:00Z", adesso, 10).viva, false, "undici giorni: muta");
  // Il caso che conta: nessuna run schedulata non e' "va tutto bene".
  assert.equal(verdetto(null, adesso, 10).viva, false, "nessuna run: muta");

  // Il limite arriva da fuori e va usato: con 40 giorni un mese di silenzio e' normale,
  // con 10 e' un allarme. Passare il limite sbagliato e' il modo silenzioso di rompere
  // la sorveglianza del mensile, quindi si asserisce che la soglia sia davvero letta.
  assert.equal(verdetto("2026-07-14T00:00:00Z", adesso, 40).viva, true, "30 giorni sotto 40: viva");
  assert.equal(verdetto("2026-07-14T00:00:00Z", adesso, 10).viva, false, "30 giorni sopra 10: muta");

  // Ogni sorvegliato deve avere un limite MAGGIORE DEL PROPRIO PERIODO, o l'allarme
  // suonerebbe a ogni giro. La versione precedente chiedeva `limite >= 10`, che era il
  // periodo dei soli cron settimanali travestito da regola generale: ha smesso di valere
  // il giorno in cui sono entrati in lista un cron da 3 giorni e uno giornaliero.
  // E' la configurazione a poter essere sbagliata, non la logica sulle date.
  for (const s of SORVEGLIATI) {
    assert.ok(s.limite > s.periodo, `${s.slug}: limite ${s.limite} non supera il periodo ${s.periodo}`);
    assert.ok(s.repo.includes("/") && s.workflow.endsWith(".yml"), `${s.slug}: puntatore malformato`);
  }

  console.log(`self-check: ok (${SORVEGLIATI.length} cron sorvegliati)`);
}

async function main() {
  if (process.argv.includes("--self-check")) return selfCheck();

  const adesso = new Date();
  const muti = [];

  for (const sorvegliato of SORVEGLIATI) {
    let esito;
    try {
      esito = verdetto(await ultimaRunSchedulata(sorvegliato), adesso, sorvegliato.limite);
    } catch (errore) {
      // Un 503 di api.github.com non e' un cron morto: si segnala e si passa oltre,
      // senza aprire una issue e senza fermare il controllo degli altri due.
      console.error(`::warning::${sorvegliato.slug}: controllo non riuscito (${errore.message})`);
      continue;
    }
    console.log(`${sorvegliato.slug} (${sorvegliato.repo}/${sorvegliato.workflow}): ${esito.motivo}`);
    if (!esito.viva) muti.push({ ...sorvegliato, esito });
  }

  for (const muto of muti) {
    console.error(`::error::${muto.slug} non gira piu': ${muto.esito.motivo}`);
    // L'evento a Sentry e' l'allarme che il cron monitor avrebbe dato. Fail-open per
    // costruzione (vedi engine/lib/sentry.mjs): senza DSN e' un no-op, e un invio
    // fallito non cambia il verdetto qui sotto.
    await captureException(
      new CronMuto(
        `${muto.slug}: ${muto.cosa} non parte piu' — ${muto.esito.motivo}. ` +
          `Causa tipica: GitHub disabilita gli schedule dopo 60 giorni di inattivita' su ${muto.repo}.`,
      ),
      { script: "sentinella-cron" },
    );
  }

  if (muti.length > 0) process.exitCode = 1;
}

main().catch((errore) => {
  // Un errore imprevisto QUI e' un difetto di questo script, non un cron morto.
  console.error(`::warning::sentinella non riuscita: ${errore.message}`);
});
