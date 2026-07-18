// engine/lib/gsc.mjs
// Google Search Console Search Analytics, read-only. OAuth2 refresh-token flow, fetch nativo.
// Segreti via Doppler. Nessuna scrittura verso Google: solo lettura dei propri dati.

async function accessToken() {
  const { GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN } = process.env;
  if (!GSC_CLIENT_ID || !GSC_CLIENT_SECRET || !GSC_REFRESH_TOKEN) {
    throw new Error("missing env: GSC_CLIENT_ID / GSC_CLIENT_SECRET / GSC_REFRESH_TOKEN (usa `doppler run`)");
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GSC_CLIENT_ID,
      client_secret: GSC_CLIENT_SECRET,
      refresh_token: GSC_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`gsc token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

// Interroga searchAnalytics sulla proprietà GSC_SITE_URL. Ritorna
// [{ query, page, clicks, impressions, ctr, position }].
export async function querySearchAnalytics({ startDate, endDate, rowLimit = 25 }) {
  const { GSC_SITE_URL } = process.env;
  if (!GSC_SITE_URL) throw new Error("missing env: GSC_SITE_URL (usa `doppler run`)");
  const token = await accessToken();
  const url =
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate, endDate, dimensions: ["query", "page"], rowLimit }),
  });
  if (!r.ok) throw new Error(`gsc query ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return (j.rows ?? []).map((row) => ({
    query: row.keys[0],
    page: row.keys[1],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

// Finestra dati: GSC ha ~2-3 giorni di ritardo. Default: [oggi-30, oggi-3].
export function defaultWindow(now = new Date()) {
  const iso = (d) => d.toISOString().slice(0, 10);
  const end = new Date(now); end.setDate(end.getDate() - 3);
  const start = new Date(now); start.setDate(start.getDate() - 30);
  return { startDate: iso(start), endDate: iso(end) };
}
