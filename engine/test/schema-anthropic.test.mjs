// Il contratto della structured output vale per OGNI schema che mandiamo
// all'API, non per quello che si è rotto per ultimo. Un file solo: quando
// nasce un terzo schema, la riga da aggiungere è qui e si vede.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { keywordRifiutate, keywordSconosciute } from "./helpers/schema-anthropic.mjs";
import { SCHEMA as JUDGE } from "../lib/judge.mjs";
import { SCHEMA as GENERATE } from "../generate.mjs";

const SCHEMI = [
  ["judge (rubrica)", JUDGE],
  ["generate (articolo it+en)", GENERATE],
];

for (const [nome, schema] of SCHEMI) {
  test(`${nome}: nessuna keyword rifiutata dalla structured output`, () => {
    const violazioni = keywordRifiutate(schema);
    assert.deepEqual(
      violazioni,
      [],
      `l'API risponde 400 e il gate muore:\n${violazioni.map((v) => `  ${v.percorso}: ${v.keyword} (${v.perche})`).join("\n")}`,
    );
  });

  test(`${nome}: nessuna keyword fuori da quelle che conosciamo`, () => {
    const fuori = keywordSconosciute(schema);
    assert.deepEqual(
      fuori,
      [],
      `keyword non nel contratto noto — verificarla sulla doc prima di usarla:\n${fuori.map((v) => `  ${v.percorso}: ${v.keyword}`).join("\n")}`,
    );
  });
}

// Il controllo deve poter fallire, o non sta controllando niente.
test("il validatore vede una keyword rifiutata annidata in profondità", () => {
  const marcio = {
    type: "object",
    properties: {
      voti: {
        type: "array",
        items: { type: "object", properties: { voto: { type: "integer", minimum: 1 } } },
      },
    },
  };
  const v = keywordRifiutate(marcio);
  assert.equal(v.length, 1);
  assert.equal(v[0].keyword, "minimum");
  assert.match(v[0].percorso, /voti.*items.*voto/);
});

// Un campo che si chiama "pattern" o "maximum" è un campo, non una keyword.
test("il validatore non confonde il nome di un campo con una keyword", () => {
  const legittimo = {
    type: "object",
    additionalProperties: false,
    properties: {
      pattern: { type: "string" },
      maximum: { type: "number" },
    },
  };
  assert.deepEqual(keywordRifiutate(legittimo), []);
});
