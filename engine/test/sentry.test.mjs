// Unit della lib Sentry (lib/sentry.mjs): envelope via fetch stubbata, fail-open,
// e catch top-level provato su un processo figlio reale. Zero rete.
import { test, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { captureException } from "../lib/sentry.mjs";
import { runEngine } from "./helpers/spawn.mjs";

const DSN = "https://abc123def@o999.ingest.de.sentry.io/4510012345";
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: String(init.body ?? "") });
    return handler ? handler() : new Response("{}", { status: 200 });
  };
  return calls;
}

test("captureException: envelope sull'endpoint del DSN, con eccezione e tag script", async () => {
  const calls = stubFetch();
  const err = new Error("boom di prova");
  await captureException(err, { script: "ingest", dsn: DSN });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://o999.ingest.de.sentry.io/api/4510012345/envelope/");
  const [header, itemHeader, event] = calls[0].body.split("\n").map((l) => JSON.parse(l));
  assert.equal(header.dsn, DSN);
  assert.equal(itemHeader.type, "event");
  assert.equal(event.tags.script, "ingest");
  const exc = event.exception.values[0];
  assert.equal(exc.type, "Error");
  assert.equal(exc.value, "boom di prova");
  // frames oldest-first: l'ultimo frame è il punto del throw (questo file)
  const frames = exc.stacktrace.frames;
  assert.ok(frames.length > 0);
  assert.match(frames.at(-1).filename, /sentry\.test\.mjs/);
});

test("captureException: senza DSN è un no-op (nessuna fetch, nessun throw)", async () => {
  const calls = stubFetch();
  await captureException(new Error("x"), { script: "ingest", dsn: undefined });
  assert.equal(calls.length, 0);
});

test("captureException: fail-open — l'invio fallito non propaga", async () => {
  stubFetch(() => { throw new Error("rete giù"); });
  await captureException(new Error("x"), { script: "ingest", dsn: DSN }); // non deve lanciare
});

test("catchTopLevel: rejection non gestita -> exit 1, errore su stderr, processo chiuso", () => {
  const scriptlet = [
    "const { catchTopLevel } = await import('./engine/lib/sentry.mjs');",
    "catchTopLevel('prova');",
    "Promise.reject(new Error('esplosione top-level'));",
  ].join("\n");
  const r = runEngine(["--input-type=module", "-e", scriptlet], [
    { match: "/envelope/", method: "POST", body: {} },
  ], { SENTRY_DSN: DSN });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /esplosione top-level/);
});
