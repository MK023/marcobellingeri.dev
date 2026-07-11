import { defineCollection, z } from 'astro:content';
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
    problem: z.string(),
    approach: z.string(),
    result: z.string(),
    lesson: z.string(),
  }),
});

export const collections = { cases };
