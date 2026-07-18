// Astro 6 deprecata `z` esportata da `astro:content`: zod si importa da `astro/zod`
// (è il re-export di Astro, non una dipendenza in più).
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

// Field Notes: un caso al mese, schema fisso, bilingue (ADR-0001 §3).
// Ogni voce è un file Markdown in src/content/cases/<lang>/ — per aggiungerne
// uno nuovo si copia la coppia it/ + en/ e si cambiano i campi.
// Content Layer API (Astro 6+): collection caricata via glob loader.
const cases = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/cases' }),
  schema: z.object({
    lang: z.enum(['it', 'en']),
    month: z.string(),          // es. "Luglio 2026" / "July 2026"
    date: z.coerce.date(),
    title: z.string(),
    stat: z.number().optional(),        // es. 41 — omesso se il caso non ha una metrica secca
    statSuffix: z.string().optional(),  // es. "×"
    problem: z.string(),
    approach: z.string(),
    result: z.string(),
    lesson: z.string(),
  }),
});

// Magazine: un caso al mese di IA applicata sul lavoro nei domini di Marco,
// generato da una pipeline e verificato sulle fonti. Stesso schema di `cases`
// più `number` (il numero del volume) e `sector` (il settore trattato).
const magazine = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/magazine' }),
  schema: z.object({
    lang: z.enum(['it', 'en']),
    number: z.number(),         // numero progressivo del volume (1 = punto zero)
    sector: z.string(),         // es. "insurance"
    month: z.string(),          // es. "Luglio 2026" / "July 2026"
    date: z.coerce.date(),
    title: z.string(),
    stat: z.number().optional(),        // metrica secca — omessa se il caso non ne ha una
    statSuffix: z.string().optional(),  // es. "×"
    problem: z.string(),
    approach: z.string(),
    result: z.string(),
    lesson: z.string(),
  }),
});

// Writing: articoli long-form a corpo libero (Markdown con blocchi di codice),
// bilingue it/en. A differenza di `cases`/`magazine` — schema fisso a campi — qui
// il contenuto è il body Markdown renderizzato. Ogni voce è un file in
// src/content/writing/<lang>/; lo slug condiviso tra it/ + en/ è l'URL stabile
// a cui punta l'eventuale canonical del cross-post (es. dev.to).
const writing = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/writing' }),
  schema: z.object({
    lang: z.enum(['it', 'en']),
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = { cases, magazine, writing };
