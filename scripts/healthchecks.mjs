#!/usr/bin/env node
// I check healthchecks.io come codice: la tabella qui sotto E' la configurazione.
//
// PERCHE' NON BASTA `create=1`. L'URL di ping sa creare un check al primo battito
// (`?create=1`), ma la doc e' esplicita: "It is currently not possible to specify a
// custom period, grace time, or other parameters through the ping URL". I check
// auto-creati nascono con periodo 1 giorno e grace 1 ora, fissi — valori che per
// meta' di questi cron sono sbagliati in un verso o nell'altro. Quindi la config
// passa dalla Management API, che ha l'upsert idempotente su `unique: ["slug"]`:
// rilanciare `--apply` non duplica nulla e riallinea cio' che qualcuno avesse
// cambiato dalla dashboard.
//
// DUE CHIAVI, DUE POTERI. La *ping key* sa solo dire "sono vivo" e sta nei secret
// di GitHub, perche' i workflow devono pingare. La *API key* puo' allungare un
// `grace` fino a rendere cieco l'allarme, e oggi sta solo in Doppler: la CI che
// questi check sorvegliano non deve poterli riconfigurare.
//
// `healthchecks.yml` lancia `--self-check` su ogni PR, senza segreti. Lo step
// `--apply` esiste gia' in quel workflow ma resta inerte finche' il secret manca:
// se un domani lo aggiungerai, l'apply diventa automatico e quella separazione di
// poteri finisce. E' una scelta, non un difetto — ma va fatta sapendola.
//
// DA DOVE VENGONO timeout E grace. Non sono stime: `gap` e' il divario massimo
// misurato fra due run schedulate consecutive, letto dall'API di GitHub il
// 2026-09-03 sulle ultime 40 run di ciascun workflow. `timeout + grace` deve
// superarlo, altrimenti l'allarme suona su un ritardo normale di GitHub e si
// impara a ignorarlo — il modo di fallire che ha prodotto undici issue inutili su
// `supabase-keepalive` fra luglio e settembre. Lo scheduling di GitHub e'
// best-effort dichiarato: i giornalieri slittano fino a +10h.
//
//   node scripts/healthchecks.mjs --self-check  # niente rete, niente segreti
//   node scripts/healthchecks.mjs --apply   # richiede HEALTHCHECKS_API_KEY

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RADICE = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = join(RADICE, ".github", "workflows");
const API = "https://healthchecks.io/api/v3/checks/";

const ORA = 3600;
const GIORNO = 24 * ORA;

// `gap` in ore: divario massimo osservato fra due run consecutive (2026-09-03).
// Rimisurarlo prima di stringere un `grace`, non dopo.
const CHECKS = [
  { slug: "magazine-advance",   workflow: "magazine-advance.yml",   timeout: GIORNO,       grace: 18 * ORA,  gap: 34.4 },
  { slug: "devto-publish-due",  workflow: "devto-publish-due.yml",  timeout: GIORNO,       grace: 18 * ORA,  gap: 34.3 },
  { slug: "edicola-card",       workflow: "edicola-card.yml",       timeout: GIORNO,       grace: 18 * ORA,  gap: 34.2 },
  { slug: "sentinella-cron",    workflow: "sentinella-cron.yml",    timeout: GIORNO,       grace: 18 * ORA,  gap: 34.1 },
  { slug: "supabase-keepalive", workflow: "supabase-keepalive.yml", timeout: 3 * GIORNO,   grace: 18 * ORA,  gap: 83.7 },
  { slug: "visibility",         workflow: "visibility.yml",         timeout: 7 * GIORNO,   grace: 24 * ORA,  gap: 174.0 },
  { slug: "magazine-ingest",    workflow: "magazine-ingest.yml",    timeout: 31 * GIORNO,  grace: 48 * ORA,  gap: 746.8 },
  { slug: "competitor-radar",   workflow: "competitor-radar.yml",   timeout: 31 * GIORNO,  grace: 48 * ORA,  gap: 747.0 },
];

// Il watcher legge se stesso, quindi il suo nome e' un presupposto. Se qualcuno lo
// rinomina, meglio un errore che dice cosa e' successo di un ENOENT non gestito.
function leggiWorkflowProprio() {
  try {
    return readFileSync(join(WORKFLOWS, "healthchecks.yml"), "utf8");
  } catch {
    return null;
  }
}

function nomeWorkflow(file) {
  const m = readFileSync(join(WORKFLOWS, file), "utf8").match(/^name:\s*(.+?)\s*$/m);
  return m ? m[1] : null;
}

// L'elenco `workflows:` sotto `workflow_run:` in healthchecks.yml. Letto a mano
// invece che con un parser YAML: zero dipendenze, e la forma di quel blocco la
// decidiamo noi nel file accanto.
function elencoWorkflowRun() {
  const grezzo = leggiWorkflowProprio();
  if (grezzo === null) return [];
  const righe = grezzo.split("\n");
  const inizio = righe.findIndex((r) => /^\s+workflows:\s*$/.test(r));
  if (inizio < 0) return [];
  const nomi = [];
  for (const r of righe.slice(inizio + 1)) {
    const m = r.match(/^\s+-\s+(.+?)\s*$/);
    if (!m) break;
    nomi.push(m[1]);
  }
  return nomi;
}

// La soppressione zizmor su `workflow_run` vale solo finche' il job `battito` resta
// innocuo: niente checkout, niente artefatti, nessun permesso, e il filtro sullo
// schedule. Se qualcuno aggiunge uno di quei tre, il finding HIGH torna a essere
// vero mentre il commento continua a negarlo — quindi la forma si verifica qui.
function formaBattito() {
  const testo = leggiWorkflowProprio();
  if (testo === null) return ["healthchecks.yml non trovato: il watcher e' stato rinominato o rimosso"];
  const righe = testo.split("\n");
  const da = righe.findIndex((r) => /^\s{2}battito:/.test(r));
  if (da < 0) return ["healthchecks.yml: job `battito` non trovato"];
  let a = righe.length;
  for (let i = da + 1; i < righe.length; i += 1) {
    if (/^\s{2}\S/.test(righe[i])) { a = i; break; }
  }
  const blocco = righe.slice(da, a).join("\n");

  const errori = [];
  if (/uses:\s*actions\/checkout/.test(blocco)) {
    errori.push("battito: un checkout rende reale il rischio soppresso in healthchecks.yml");
  }
  // L'artefatto e' IL vettore: la PR del fork lo produce, il workflow privilegiato lo
  // scarica. `gh run download` fa la stessa cosa dell'action e va nominato a parte,
  // altrimenti il tripwire guarda solo una delle due porte.
  if (/download-artifact|gh\s+run\s+download|actions\/github-script/i.test(blocco)) {
    errori.push("battito: scaricare artefatti o eseguire github-script e' il vettore dell'exploit workflow_run");
  }
  // Solo permessi NON vuoti: `permissions: {}` a livello di job e' piu' restrittivo,
  // non meno, e un guard che blocca anche gli irrigidimenti insegna ad aggirarlo.
  const permJob = blocco.match(/^\s+permissions:\s*(.*)$/m);
  if (permJob && permJob[1].trim() !== "{}") {
    errori.push("battito: permessi a livello di job, la soppressione presuppone nessun GITHUB_TOKEN");
  }
  if (!/^permissions:\s*\{\}\s*$/m.test(testo)) {
    errori.push("healthchecks.yml: manca `permissions: {}` a livello di workflow");
  }
  if (!/workflow_run\.event\s*==\s*'schedule'/.test(blocco)) {
    errori.push("battito: manca il filtro su workflow_run.event == 'schedule'");
  }
  return errori;
}

function workflowSchedulati() {
  return readdirSync(WORKFLOWS)
    .filter((f) => /\.ya?ml$/.test(f))
    .filter((f) => /^\s*-?\s*cron:/m.test(readFileSync(join(WORKFLOWS, f), "utf8")));
}

function verifica() {
  const errori = [];
  const visti = new Set();

  for (const c of CHECKS) {
    if (!/^[a-z0-9_-]+$/.test(c.slug)) errori.push(`${c.slug}: slug non valido (ammessi a-z 0-9 - _)`);
    if (visti.has(c.slug)) errori.push(`${c.slug}: slug duplicato`);
    visti.add(c.slug);

    // Il vincolo che conta: la finestra deve coprire il ritardo gia' osservato.
    const finestra = (c.timeout + c.grace) / ORA;
    if (finestra <= c.gap) {
      errori.push(`${c.slug}: finestra ${finestra}h non supera il divario misurato ${c.gap}h`);
    } else if (finestra - c.gap < 4) {
      errori.push(`${c.slug}: margine ${(finestra - c.gap).toFixed(1)}h troppo stretto (minimo 4h)`);
    }

    // Limiti dichiarati dalla Management API.
    for (const [campo, v] of [["timeout", c.timeout], ["grace", c.grace]]) {
      if (v < 60 || v > 31536000) errori.push(`${c.slug}: ${campo} ${v}s fuori dai limiti 60..31536000`);
    }
  }

  // Un cron nuovo senza check e' il buco che questo script esiste per impedire.
  const coperti = new Set(CHECKS.map((c) => c.workflow));
  for (const wf of workflowSchedulati()) {
    if (!coperti.has(wf)) {
      errori.push(`${wf}: ha uno schedule ma nessun check nella tabella`);
    }
  }

  // Un check che punta a un workflow sparito e' un allarme che non suonera' mai.
  const esistenti = new Set(readdirSync(WORKFLOWS));
  for (const c of CHECKS) {
    if (!esistenti.has(c.workflow)) {
      errori.push(`${c.slug}: workflow ${c.workflow} non esiste`);
      continue;
    }
    // La convenzione su cui si regge il ping: `healthchecks.yml` ricava lo slug da
    // `basename(path .yml)`. Se i due divergono il ping va su un check inesistente e
    // healthchecks risponde 404 senza che nessuno guardi.
    if (c.slug !== c.workflow.replace(/\.yml$/, "")) {
      errori.push(`${c.slug}: lo slug deve essere il nome del file (${c.workflow})`);
    }
  }

  // IL LEGAME PIU' FRAGILE. `workflow_run` filtra per NOME del workflow, non per
  // file: rinominare un `name:` scollega il watcher e il cron smette di battere in
  // silenzio, lasciando il monitor verde. Qui i due lati vengono confrontati.
  const sorvegliati = elencoWorkflowRun();
  for (const c of CHECKS) {
    if (!esistenti.has(c.workflow)) continue;
    const nome = nomeWorkflow(c.workflow);
    if (!nome) errori.push(`${c.workflow}: manca la riga \`name:\``);
    else if (!sorvegliati.includes(nome)) {
      errori.push(`${c.workflow}: nome "${nome}" assente dall'elenco workflow_run di healthchecks.yml`);
    }
  }

  errori.push(...formaBattito());

  for (const e of errori) console.error(`::error::${e}`);
  if (errori.length > 0) {
    console.error(`\ncheck: ${errori.length} problemi`);
    process.exitCode = 1;
    return;
  }
  console.log(`check: ok (${CHECKS.length} check, ${workflowSchedulati().length} workflow schedulati)`);
}

async function applica() {
  const chiave = process.env.HEALTHCHECKS_API_KEY;
  if (!chiave) {
    console.error("::error::HEALTHCHECKS_API_KEY assente: sta in Doppler, usa `doppler run --`");
    process.exitCode = 1;
    return;
  }

  let falliti = 0;
  for (const c of CHECKS) {
    const risposta = await fetch(API, {
      method: "POST",
      headers: { "X-Api-Key": chiave, "Content-Type": "application/json" },
      // `unique: ["slug"]` rende la POST un upsert: 201 se creato, 200 se aggiornato.
      body: JSON.stringify({
        slug: c.slug,
        name: c.slug,
        timeout: c.timeout,
        grace: c.grace,
        tags: "marcobellingeri-dev cron",
        unique: ["slug"],
      }),
    });
    if (!risposta.ok) {
      // Mai il corpo altrui nei log (S5145): lo stato e' nostro, il resto no.
      console.error(`::error::${c.slug}: HTTP ${risposta.status}`);
      falliti += 1;
      continue;
    }
    const azione = risposta.status === 201 ? "creato" : "aggiornato";
    console.log(`${c.slug}: ${azione} (timeout ${c.timeout / ORA}h, grace ${c.grace / ORA}h)`);
  }

  if (falliti > 0) process.exitCode = 1;
}

const modo = process.argv[2];
if (modo === "--self-check") verifica();
else if (modo === "--apply") await applica();
else {
  console.error("uso: healthchecks.mjs --self-check | --apply");
  process.exitCode = 2;
}
