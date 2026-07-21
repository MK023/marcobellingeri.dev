// Error tracking Sentry via envelope API — zero dipendenze, fetch nativa,
// stesso pattern hand-rolled di langfuse.mjs.
//
// FAIL-OPEN by design: senza SENTRY_DSN è un no-op, e un invio fallito NON deve
// mai aggiungere danno a uno script già in errore (warn e avanti). Il flusso
// "gestione errori automatizzata" onesto: errore -> Sentry -> Seer analizza ->
// fix in PR. Il DSN non è un segreto in senso stretto (chiave di solo ingest),
// ma vive comunque in Doppler come tutto il resto.
import { randomUUID } from "node:crypto";

// DSN https://<key>@<host>/<project> -> endpoint envelope del progetto.
function endpoint(dsn) {
  const m = dsn?.match(/^https:\/\/[a-f0-9]+@([^/]+)\/(\d+)$/);
  return m ? `https://${m[1]}/api/${m[2]}/envelope/` : null;
}

// Stack di Node -> frames Sentry (oldest-first, come vuole il protocollo).
function frames(stack) {
  return String(stack ?? "")
    .split("\n")
    .slice(1)
    .reverse()
    .map((riga) => {
      const m = riga.trim().match(/^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
      if (!m) return null;
      const [, fn, file, line, col] = m;
      return {
        function: fn ?? "?",
        filename: file,
        lineno: Number(line),
        colno: Number(col),
        in_app: !file.startsWith("node:") && !file.includes("node_modules"),
      };
    })
    .filter(Boolean);
}

// Manda l'errore a Sentry. `dsn` è iniettabile per i test; di default dall'env.
export async function captureException(err, { script, dsn = process.env.SENTRY_DSN } = {}) {
  const url = endpoint(dsn);
  if (!url) return; // no-op senza DSN: la pipeline non cambia comportamento
  const event = {
    event_id: randomUUID().replaceAll("-", ""),
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    environment: "engine",
    tags: { script },
    exception: {
      values: [{
        type: err?.name ?? "Error",
        value: String(err?.message ?? err),
        stacktrace: { frames: frames(err?.stack) },
      }],
    },
  };
  const envelope = [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) console.warn(`sentry: invio fallito ${r.status} (script non impattato)`);
  } catch (e) {
    console.warn(`sentry: invio fallito (${e?.message}) — script non impattato`);
  }
}

// Catch top-level per gli script CLI: errore non gestito -> Sentry -> exit 1.
// Stessa semantica di un crash nudo (stack su stderr, exit code 1): la CI e il
// cron che apre le issue non vedono differenza, Sentry sì.
export function catchTopLevel(script) {
  const esci = (err) => {
    console.error(err);
    captureException(err, { script }).finally(() => process.exit(1));
  };
  process.on("uncaughtException", esci);
  process.on("unhandledRejection", esci);
}
