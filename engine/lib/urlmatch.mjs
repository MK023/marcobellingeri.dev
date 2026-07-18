// engine/lib/urlmatch.mjs
// Puro, zero I/O. La risposta di un answer engine è input non fidato: qui la si usa
// SOLO per confrontare host, mai per eval/DOM/query.

// Ritorna l'host normalizzato (minuscolo, senza www., senza porta) o null.
export function normalizeHost(input) {
  if (!input || typeof input !== "string") return null;
  let host;
  try {
    host = new URL(input.includes("://") ? input : `https://${input}`).hostname;
  } catch {
    return input.toLowerCase().trim() || null;
  }
  return host.toLowerCase().replace(/^www\./, "");
}

// true se `url` è sul dominio `domain` o un suo sottodominio. Blocca il suffix attack
// (marcobellingeri.dev.evil.com) perché confronta segmenti, non sottostringhe.
export function isSameDomain(url, domain) {
  const h = normalizeHost(url);
  const d = normalizeHost(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

// Dato un elenco di citazioni (stringhe URL o oggetti {url}) e il dominio target,
// ritorna { present, rank (1-based), matchedUrl }.
export function findCitation(citations, domain) {
  const list = Array.isArray(citations) ? citations : [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const url = typeof item === "string" ? item : item?.url;
    if (url && isSameDomain(url, domain)) {
      return { present: true, rank: i + 1, matchedUrl: url };
    }
  }
  return { present: false, rank: null, matchedUrl: null };
}
