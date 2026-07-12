// Spawna uno script dell'engine con fetch mockata (vedi fetch-mock.mjs) ed env
// finto: zero rete reale, zero segreti. Stessa filosofia delle guardie CLI in
// unit.test.mjs, estesa ai flussi completi dei moduli top-level.
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = fileURLToPath(new URL("../../..", import.meta.url)); // repo root
const PRELOAD = pathToFileURL(fileURLToPath(new URL("./fetch-mock.mjs", import.meta.url))).href;

// Chiavi fake per tutti i client; Langfuse spento (fail-open no-op nei figli).
const FAKE_ENV = {
  SUPABASE_URL: "https://fake.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sk_fake",
  EMBEDDING_API_KEY: "vk_fake",
  VALYU_API_KEY: "valyu_fake",
  ANTHROPIC_API_KEY: "sk-ant_fake",
  FIRECRAWL_API_KEY: "fc_fake",
  LANGFUSE_BASE_URL: "",
  LANGFUSE_PUBLIC_KEY: "",
  LANGFUSE_SECRET_KEY: "",
};

export function runEngine(args, routes = [], envOverride = {}) {
  const env = { ...process.env, ...FAKE_ENV, FETCH_MOCK: JSON.stringify(routes), ...envOverride };
  const r = spawnSync("node", ["--import", PRELOAD, ...args], { cwd: ROOT, env, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
