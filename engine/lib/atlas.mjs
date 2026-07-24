// Estrattore dei case study da ATLAS (formato v6). Non e' un parser YAML
// generale: riconosce la forma reale del file catturata il 24-07-2026 (chiave
// del blocco a 2 spazi, campi a 4) e degrada a lista vuota su tutto il resto —
// stessa scelta di parseRssItems nel Worker, stesso motivo.
//
// `object-type: case-study` e' il discriminatore. Gli stessi id compaiono come
// chiavi anche sotto `relationships:` (63 su 126 nel file del 2026-06), ma —
// misurato, non dedotto — quei blocchi oggi non hanno `name:`, quindi cadrebbero
// comunque per assenza di titolo. Il marcatore resta perche' non voglio che la
// correttezza dipenda da quell'accidente: e' la riga con cui il file dichiara
// cos'e' un oggetto, ed e' l'unica che regge un cambio di formato (v5 -> v6 e'
// del maggio 2026). Il test lo mette alla prova con un relationships che HA un
// nome, altrimenti sarebbe un controllo che nessun test puo' far fallire.
//
// Tutte le regex qui sono ancorate e girano su UNA riga: niente quantificatori
// annidati su testo multilinea, che e' come /api/radar si e' preso un ReDoS.

export const STUDIO = "https://atlas.mitre.org/studies/";

// `dist/ATLAS-latest.yaml` e' un SYMLINK: via raw.githubusercontent torna il
// percorso di destinazione come testo (18-20 byte), non i dati. Oggi la catena
// e' doppia: ATLAS-latest -> v6/ATLAS-latest -> v6/ATLAS-2026.06.
//
// Ritorna il prossimo percorso da scaricare, o null se il corpo sono gia' i dati.
// Il target e' contenuto REMOTO che finisce dentro un URL: qui e' confinato a un
// nome di file relativo (niente `..`, niente `/` iniziale, niente schema o host),
// cosi' non puo' spostare la richiesta altrove.
export function prossimoSymlink(corpo, percorso) {
  const target = String(corpo).trim();
  if (!/^[\w.-]+(?:\/[\w.-]+)*\.yaml$/.test(target)) return null;
  if (target.split("/").includes("..")) return null;
  const dir = percorso.includes("/") ? percorso.slice(0, percorso.lastIndexOf("/") + 1) : "";
  return dir + target;
}

const scrosta = (v) => {
  const s = v.trim();
  const q = s.startsWith("'") && s.endsWith("'");
  const qq = s.startsWith('"') && s.endsWith('"');
  return (q || qq) && s.length > 1 ? s.slice(1, -1) : s;
};

export function estraiCasi(yaml, { max = Infinity } = {}) {
  const casi = [];
  let blocco = null;

  const chiudi = () => {
    if (blocco?.caso && blocco.titolo) {
      casi.push({ id: blocco.id, titolo: blocco.titolo, url: STUDIO + blocco.id, data: blocco.data });
    }
    blocco = null;
  };

  for (const riga of String(yaml).split("\n")) {
    const chiave = riga.match(/^ {2}(AML\.CS\d+):\s*$/);
    if (chiave) {
      chiudi();
      blocco = { id: chiave[1], titolo: null, data: null, caso: false };
      continue;
    }
    if (!blocco) continue;
    // Le descrizioni contengono righe vuote: non chiudono il blocco. Chiude
    // qualunque riga con rientro < 3 (nuova chiave di pari livello o top-level).
    if (riga.trim() === "") continue;
    if (!/^ {3}/.test(riga)) {
      chiudi();
      continue;
    }
    if (/^ {4}object-type: case-study\s*$/.test(riga)) {
      blocco.caso = true;
      continue;
    }
    // Rientro esatto a 4: i `title:` delle references stanno a 6, i loro
    // `- id:` a 4 ma col trattino — nessuno dei due entra qui.
    const nome = riga.match(/^ {4}name: (.+)$/);
    if (nome) {
      blocco.titolo = scrosta(nome[1]).slice(0, 160);
      continue;
    }
    const data = riga.match(/^ {4}date: '?(\d{4}-\d{2}-\d{2})'?\s*$/);
    if (data) blocco.data = data[1];
  }
  chiudi();

  return casi.sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, max);
}
