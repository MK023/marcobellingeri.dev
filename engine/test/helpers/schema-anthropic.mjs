// Le keyword che la structured output di Anthropic accetta in uno schema, e
// quelle che rifiuta con un 400. Non è una libreria di validazione JSON Schema:
// è il contratto dell'API, scritto una volta e verificato su OGNI schema che
// mandiamo — perché lo schema è fisso e va rispettato, parametri compresi.
//
// L'11-08-2026 il gate del judge era morto per questo: "For 'integer' type,
// properties maximum, minimum are not supported". L'API si ferma al primo
// difetto, quindi un errore alla volta nasconde gli altri — questo controllo li
// trova tutti insieme, prima della CI.
//
// Gli SDK Python e TypeScript rimuovono da soli i vincoli non supportati.
// L'engine è zero-dep e parla all'API con fetch nativo: qui non li toglie
// nessuno, e il test è l'unica rete.

// Fonte: docs Anthropic, "Structured Outputs — JSON Schema Limitations".
const AMMESSE = new Set([
  "type", "properties", "required", "additionalProperties", "items",
  "enum", "const", "anyOf", "allOf", "$ref", "$defs", "definitions",
  "format", "description", "title",
]);

// Rifiutate esplicitamente: vincoli numerici, vincoli di lunghezza, vincoli
// complessi su array. Elencate a parte per dare un messaggio che dice PERCHÉ.
const RIFIUTATE = new Map([
  ["minimum", "vincolo numerico"],
  ["maximum", "vincolo numerico"],
  ["exclusiveMinimum", "vincolo numerico"],
  ["exclusiveMaximum", "vincolo numerico"],
  ["multipleOf", "vincolo numerico"],
  ["minLength", "vincolo di lunghezza"],
  ["maxLength", "vincolo di lunghezza"],
  ["pattern", "vincolo su stringa"],
  ["minItems", "vincolo su array"],
  ["maxItems", "vincolo su array"],
  ["uniqueItems", "vincolo su array"],
  ["minProperties", "vincolo su oggetto"],
  ["maxProperties", "vincolo su oggetto"],
]);

// Ritorna [{ percorso, keyword, perche }] — vuoto se lo schema è accettabile.
// Il percorso serve a trovare il nodo colpevole senza rileggere tutto lo schema.
export function keywordRifiutate(schema, percorso = "$") {
  if (!schema || typeof schema !== "object") return [];
  if (Array.isArray(schema)) {
    return schema.flatMap((v, i) => keywordRifiutate(v, `${percorso}[${i}]`));
  }
  const violazioni = [];
  for (const [k, v] of Object.entries(schema)) {
    if (RIFIUTATE.has(k)) {
      violazioni.push({ percorso, keyword: k, perche: RIFIUTATE.get(k) });
    }
    // `properties` e `$defs` hanno per chiavi i NOMI dei campi: lì dentro
    // "pattern" o "maximum" sono campi nostri, non keyword dello schema.
    const figli = k === "properties" || k === "$defs" || k === "definitions"
      ? Object.entries(v ?? {}).flatMap(([nome, sub]) => keywordRifiutate(sub, `${percorso}.${nome}`))
      : keywordRifiutate(v, `${percorso}.${k}`);
    violazioni.push(...figli);
  }
  return violazioni;
}

// Le keyword che non conosciamo non le vietiamo: l'API ne accetta più di quante
// ne usiamo, e un elenco chiuso qui bloccherebbe uno schema legittimo domani.
// Questa funzione serve a dirlo ad alta voce quando succede, non a fermare la CI.
export function keywordSconosciute(schema, percorso = "$") {
  if (!schema || typeof schema !== "object") return [];
  if (Array.isArray(schema)) {
    return schema.flatMap((v, i) => keywordSconosciute(v, `${percorso}[${i}]`));
  }
  const fuori = [];
  for (const [k, v] of Object.entries(schema)) {
    if (!AMMESSE.has(k) && !RIFIUTATE.has(k)) fuori.push({ percorso, keyword: k });
    const figli = k === "properties" || k === "$defs" || k === "definitions"
      ? Object.entries(v ?? {}).flatMap(([nome, sub]) => keywordSconosciute(sub, `${percorso}.${nome}`))
      : keywordSconosciute(v, `${percorso}.${k}`);
    fuori.push(...figli);
  }
  return fuori;
}
