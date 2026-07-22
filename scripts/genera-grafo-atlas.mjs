#!/usr/bin/env node
// Genera il grafo pubblicabile di Atlas (la wiki privata di Marco) per la
// pagina /atlas del sito. Si lancia A MANO quando si vuole rinfrescare:
//   node scripts/genera-grafo-atlas.mjs [~/GitHub/Atlas]
// e si committa il JSON: il grafo è versionato e la PR è il posto dove un
// occhio umano verifica cosa sta per diventare pubblico.
//
// PRIVACY — la regola che giustifica questo file (opzione A, 22-07-2026):
// dei sei layer di Atlas si pubblicano SOLO `concepts/` ed `entities/tools/`
// — la mappa tecnica. Le etichette degli altri layer (personal/, career/,
// projects/, entities/companies|people, lessons/) sono l'indice della vita di
// Marco: i wikilink che li puntano vengono SCARTATI, se ne pubblica solo il
// conteggio. La pagina dichiara il filtro; questo script lo GARANTISCE.
//
// Layout precalcolato qui (force-directed, poche centinaia di iterazioni):
// il browser riceve posizioni pronte e anima solo una deriva leggera — "il
// più leggero possibile" è un vincolo esplicito di Marco.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ATLAS = process.argv[2] ?? join(homedir(), 'GitHub', 'Atlas');
const OUT = new URL('../astro-project/src/data/atlas-graph.json', import.meta.url);
// ponytail: allowlist fissa — se un giorno si vorrà pubblicare un altro layer,
// la si estende QUI, in un diff visibile, non con un flag.
const LAYERS = [
  { dir: 'concepts', prefix: 'concepts/', group: 'concept' },
  { dir: 'entities/tools', prefix: 'entities/tools/', group: 'tool' },
];

const nodi = new Map(); // id -> { id, label, group }
const perStem = new Map(); // stem -> id (per i wikilink "nudi")

for (const layer of LAYERS) {
  for (const f of await readdir(join(ATLAS, layer.dir))) {
    if (!f.endsWith('.md')) continue;
    const stem = f.slice(0, -3);
    const id = layer.prefix + stem;
    const testo = await readFile(join(ATLAS, layer.dir, f), 'utf8');
    const label = testo.match(/^# (.+)$/m)?.[1]?.trim() ?? stem;
    nodi.set(id, { id, label, group: layer.group, testo });
    perStem.set(stem, id);
  }
}

// Wikilink -> archi. Un link a un layer non pubblicato viene scartato: se ne
// tiene solo il conteggio aggregato (un numero non è un'etichetta).
let esclusi = 0;
const archi = new Set();
for (const n of nodi.values()) {
  for (const [, grezzo] of n.testo.matchAll(/\[\[([^\]|#]+)/g)) {
    const ref = grezzo.trim();
    const dest = nodi.has(ref) ? ref : perStem.get(ref);
    if (!dest) { esclusi++; continue; }
    if (dest === n.id) continue;
    // ordine lessicografico ESPLICITO: e' la chiave canonica dell'arco non
    // orientato (a-b == b-a). Il default di sort() qui farebbe lo stesso, ma
    // Sonar S2871 vuole l'intento dichiarato -- e sul metodo ha ragione.
    archi.add([n.id, dest].sort((a, b) => a.localeCompare(b)).join(' '));
  }
}

const lista = [...nodi.values()].map(({ id, label, group }) => ({ id, label, group }));
const indice = new Map(lista.map((n, i) => [n.id, i]));
const edges = [...archi].map((k) => k.split(' ').map((id) => indice.get(id)));
const degree = lista.map(() => 0);
for (const [a, b] of edges) { degree[a]++; degree[b]++; }

// Force layout O(n²) — con ~140 nodi sono <10M operazioni, meno di un secondo.
// ponytail: niente Barnes-Hut; si riapre se i nodi diventano migliaia.
const N = lista.length;
const px = [], py = [];
for (let i = 0; i < N; i++) {
  const a = (i / N) * Math.PI * 2;
  // raggio deterministico ma non uniforme: rompe la simmetria senza Math.random
  const r = 0.3 + 0.15 * ((i * 2654435761) % 97) / 97;
  px.push(0.5 + r * Math.cos(a));
  py.push(0.5 + r * Math.sin(a));
}
const K = 0.9 / Math.sqrt(N);
for (let iter = 0; iter < 400; iter++) {
  const t = 0.04 * (1 - iter / 400); // raffreddamento
  const fx = new Float64Array(N), fy = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      let dx = px[i] - px[j], dy = py[i] - py[j];
      const d2 = dx * dx + dy * dy + 1e-6;
      const rep = (K * K) / d2;
      dx *= rep; dy *= rep;
      fx[i] += dx; fy[i] += dy; fx[j] -= dx; fy[j] -= dy;
    }
  }
  for (const [a, b] of edges) {
    const dx = px[a] - px[b], dy = py[a] - py[b];
    const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    // Attrazione proporzionale a d^2 con costante EMPIRICA (0.5), scelta per
    // l'aspetto e verificata a occhio sul grafo reale. NON e' il d^2/K del
    // Fruchterman-Reingold canonico: la prima stesura scriveva (d*d)/K*...*K
    // — i due K si cancellavano (audit) e la formula eseguita era questa.
    // Il layout verificato e' questo: si dichiara la forza vera invece di
    // "correggere" verso un canone mai usato e rigenerare un grafo diverso.
    const att = 0.5 * d * d;
    fx[a] -= (dx / d) * att; fy[a] -= (dy / d) * att;
    fx[b] += (dx / d) * att; fy[b] += (dy / d) * att;
  }
  for (let i = 0; i < N; i++) {
    // gravità verso il centro + passo limitato dal raffreddamento
    fx[i] += (0.5 - px[i]) * 0.05; fy[i] += (0.5 - py[i]) * 0.05;
    const f = Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]) + 1e-9;
    const passo = Math.min(f, t);
    px[i] += (fx[i] / f) * passo; py[i] += (fy[i] / f) * passo;
  }
}
// normalizza in [0.04, 0.96] mantenendo le proporzioni
const minx = Math.min(...px), maxx = Math.max(...px), miny = Math.min(...py), maxy = Math.max(...py);
const scala = 0.92 / Math.max(maxx - minx, maxy - miny);
const grafo = {
  generatoIl: new Date().toISOString().slice(0, 10),
  layers: LAYERS.map((l) => l.prefix),
  linkEsclusi: esclusi,
  nodes: lista.map((n, i) => ({
    ...n,
    degree: degree[i],
    x: Number((0.04 + (px[i] - minx) * scala).toFixed(4)),
    y: Number((0.04 + (py[i] - miny) * scala).toFixed(4)),
  })),
  edges,
};

// La guardia, PRIMA di scrivere: nessun id fuori dall'allowlist esce da qui.
for (const n of grafo.nodes) {
  if (!LAYERS.some((l) => n.id.startsWith(l.prefix))) {
    throw new Error(`PRIVACY: nodo fuori allowlist: ${n.id}`);
  }
}

await writeFile(OUT, JSON.stringify(grafo));
console.log(`grafo Atlas: ${grafo.nodes.length} nodi, ${grafo.edges.length} archi, ${esclusi} link a layer privati esclusi`);
console.log(`-> ${OUT.pathname}`);
