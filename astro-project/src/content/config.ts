import { defineCollection, z } from 'astro:content';

// Field Notes: un caso al mese, schema fisso.
// Ogni voce è un file Markdown in src/content/cases/ — per aggiungerne uno
// nuovo basta copiare un file esistente e cambiare i campi.
const cases = defineCollection({
  type: 'content',
  schema: z.object({
    month: z.string(),          // es. "Luglio 2026"
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

export const collections = { cases };
