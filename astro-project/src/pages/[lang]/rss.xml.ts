import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { getAbsoluteLocaleUrl } from 'astro:i18n';
import { magazineSlug } from '../../lib/magazine';
import type { Lang } from '../../i18n/ui';

// Feed per lingua: /en/rss.xml e /it/rss.xml. dev.to (e ogni importer) usa il
// <link> dell'item come canonical → deve combaciare col canonical della pagina
// articolo, che infatti costruiamo con lo stesso getAbsoluteLocaleUrl.
export function getStaticPaths() {
  return [{ params: { lang: 'en' } }, { params: { lang: 'it' } }];
}

// Testo dentro un elemento XML: solo &, <, > vanno neutralizzati.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// HTML del corpo dentro CDATA: unico caso pericoloso è la sequenza di chiusura.
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

const channel = {
  it: { title: 'Marco Bellingeri — Magazine', desc: 'Un caso al mese di IA applicata sul lavoro, verificato sulle fonti.' },
  en: { title: 'Marco Bellingeri — Magazine', desc: 'One real case a month of AI put to work, checked against the sources.' },
};
const labels = {
  it: { problem: 'Problema', approach: 'Approccio', result: 'Risultato', lesson: 'Lezione appresa' },
  en: { problem: 'Problem', approach: 'Approach', result: 'Result', lesson: 'Lesson learned' },
};

export async function GET(context: APIContext) {
  const lang = context.params.lang as Lang;
  const l = labels[lang];
  const home = getAbsoluteLocaleUrl(lang, '');

  const entries = (await getCollection('magazine', (c) => c.data.lang === lang)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  const items = entries
    .map((entry) => {
      const d = entry.data;
      const url = getAbsoluteLocaleUrl(lang, `magazine/${magazineSlug(entry)}`);
      const body = ([['problem', d.problem], ['approach', d.approach], ['result', d.result], ['lesson', d.lesson]] as const)
        .map(([k, v]) => `<h2>${esc(l[k])}</h2><p>${esc(v)}</p>`)
        .join('\n');
      const excerpt = d.problem.length > 280 ? d.problem.slice(0, 277).trimEnd() + '…' : d.problem;
      return `    <item>
      <title>${esc(d.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${d.date.toUTCString()}</pubDate>
      <description>${esc(excerpt)}</description>
      <content:encoded>${cdata(body)}</content:encoded>
    </item>`;
    })
    .join('\n');

  const meta = channel[lang];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${esc(meta.title)}</title>
    <link>${home}</link>
    <description>${esc(meta.desc)}</description>
    <language>${lang}</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
