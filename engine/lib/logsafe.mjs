// S5145: ciò che arriva da fuori (DB, CLI, risposte API) non entra in un log
// così com'è — un newline dentro il dato fabbricherebbe righe di log false, e
// chi legge i log si fida delle righe. Ogni carattere di controllo diventa spazio.
//
// La classe è costruita a runtime (fromCharCode) e non con escape letterali:
// C0 (0-31), DEL (127), LS/PS Unicode (8232/8233 — JSON.parse li accetta, i log no).
const CTRL = new RegExp(
  "[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) +
  String.fromCharCode(127) + String.fromCharCode(8232) + String.fromCharCode(8233) + "]",
  "g",
);
export const logsafe = (v) => String(v).replace(CTRL, " ");
